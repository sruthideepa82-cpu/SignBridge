from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.interpret import (
    SYSTEM_PROMPT,
    AnthropicInterpreter,
    LLMUnavailable,
    build_user_message,
    clean_sentence,
)
from app.main import app, get_interpreter

EXAMPLE_GLOSSES = ["TECHNOLOGY", "USE", "IMPROVE", "LIFE", "WAR", "NOT"]
EXAMPLE_SENTENCE = "Let's use technology to improve lives, not war."


class FakeMessages:
    def __init__(self, reply=None, error=None):
        self.reply = reply
        self.error = error
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=self.reply)])


def fake_client(reply=None, error=None):
    messages = FakeMessages(reply=reply, error=error)
    return SimpleNamespace(messages=messages), messages


def test_user_message_lists_glosses_in_order_and_emotion():
    message = build_user_message(EXAMPLE_GLOSSES, "Angry")
    assert "TECHNOLOGY, USE, IMPROVE, LIFE, WAR, NOT" in message
    assert "Dominant emotion: Angry" in message


def test_clean_sentence_keeps_only_the_first_line_without_quotes():
    assert clean_sentence('  "Hello there."\n\nNote: extra') == "Hello there."


def test_clean_sentence_handles_blank_output():
    assert clean_sentence("   ") == ""


def test_interpreter_sends_the_system_prompt_and_model_and_returns_the_sentence():
    client, messages = fake_client(reply=EXAMPLE_SENTENCE)
    interpreter = AnthropicInterpreter(client, model="claude-haiku-5-5")

    sentence = interpreter(EXAMPLE_GLOSSES, "Angry")

    assert sentence == EXAMPLE_SENTENCE
    call = messages.calls[0]
    assert call["model"] == "claude-haiku-5-5"
    assert call["system"] == SYSTEM_PROMPT
    assert call["messages"][0]["role"] == "user"


def test_system_prompt_states_the_gloss_and_emotion_rules():
    assert "NOT English grammar" in SYSTEM_PROMPT
    assert "Return only the sentence" in SYSTEM_PROMPT
    assert "Let's use technology to improve lives, not war." in SYSTEM_PROMPT


def test_api_errors_become_llm_unavailable():
    client, _ = fake_client(error=RuntimeError("network down"))
    with pytest.raises(LLMUnavailable):
        AnthropicInterpreter(client, model="m")(EXAMPLE_GLOSSES, "Neutral")


def test_empty_model_output_is_treated_as_a_failure():
    client, _ = fake_client(reply="   ")
    with pytest.raises(LLMUnavailable):
        AnthropicInterpreter(client, model="m")(EXAMPLE_GLOSSES, "Neutral")


@pytest.fixture
def http():
    app.dependency_overrides.clear()
    yield TestClient(app)
    app.dependency_overrides.clear()


def use_interpreter(sentence=None, error=None):
    def interpreter(glosses, emotion):
        if error:
            raise error
        return sentence

    app.dependency_overrides[get_interpreter] = lambda: interpreter


def test_interpret_endpoint_returns_the_sentence(http):
    use_interpreter(sentence=EXAMPLE_SENTENCE)

    response = http.post("/api/interpret", json={"glosses": EXAMPLE_GLOSSES, "emotion": "Angry"})

    assert response.status_code == 200
    assert response.json() == {"sentence": EXAMPLE_SENTENCE}


def test_interpret_endpoint_reports_llm_failure_with_502(http):
    use_interpreter(error=LLMUnavailable("boom"))

    response = http.post("/api/interpret", json={"glosses": ["LIFE"], "emotion": "Sad"})

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "llm_failed"


def test_interpret_endpoint_reports_missing_api_key_with_503(http, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    response = http.post("/api/interpret", json={"glosses": ["LIFE"], "emotion": "Sad"})

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "llm_not_configured"


@pytest.mark.parametrize(
    "body",
    [
        {"glosses": [], "emotion": "Happy"},
        {"glosses": ["life"], "emotion": "Happy"},
        {"glosses": ["LIFE"], "emotion": "Bored"},
        {"glosses": ["LIFE"] * 41, "emotion": "Happy"},
    ],
)
def test_interpret_endpoint_rejects_invalid_input(http, body):
    use_interpreter(sentence="unused")

    assert http.post("/api/interpret", json=body).status_code == 422
