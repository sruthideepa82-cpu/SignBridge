"""Turns a gloss sequence and a dominant emotion into one English sentence with an LLM."""

from __future__ import annotations

from typing import Callable, Sequence

from app.schemas import EMOTIONS

SYSTEM_PROMPT = """You turn sign-language glosses into one fluent English sentence that will be read aloud.

Rules:
- A gloss is a sign's dictionary word. Gloss order is NOT English grammar. Reorder the words, and add articles, pronouns, prepositions and verb forms as needed.
- Do not add facts, opinions or content that the glosses do not support.
- NOT negates the part of the sentence it belongs to.
- The dominant emotion sets the tone only: Happy is warm, Sad is gentle, Neutral is plain, Angry is firm and direct, Questioning is phrased as a question where it fits, Skeptical is doubtful.
- Keep the sentence under 25 words.
- Return only the sentence. No quotes, labels, notes or explanation.

Example: glosses TECHNOLOGY, USE, IMPROVE, LIFE, WAR, NOT with emotion Angry
Output: Let's use technology to improve lives, not war."""

MODEL_MAX_TOKENS = 120


class LLMUnavailable(Exception):
    """The model could not produce a sentence. The client falls back to the gloss string."""


Interpreter = Callable[[Sequence[str], str], str]


def build_user_message(glosses: Sequence[str], emotion: str) -> str:
    return f"Glosses in signing order: {', '.join(glosses)}\nDominant emotion: {emotion}"


def clean_sentence(text: str) -> str:
    sentence = text.strip().splitlines()[0].strip() if text.strip() else ""
    if len(sentence) >= 2 and sentence[0] == sentence[-1] and sentence[0] in "\"'":
        sentence = sentence[1:-1].strip()
    return sentence


class AnthropicInterpreter:
    def __init__(self, client, model: str) -> None:
        self._client = client
        self._model = model

    def __call__(self, glosses: Sequence[str], emotion: str) -> str:
        if emotion not in EMOTIONS:
            raise ValueError(f"unknown emotion: {emotion}")
        try:
            response = self._client.messages.create(
                model=self._model,
                max_tokens=MODEL_MAX_TOKENS,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": build_user_message(glosses, emotion)}],
            )
        except Exception as error:  # network, auth, rate limit, or a malformed response
            raise LLMUnavailable(str(error)) from error

        text = "".join(block.text for block in response.content if getattr(block, "type", "") == "text")
        sentence = clean_sentence(text)
        if not sentence:
            raise LLMUnavailable("the model returned an empty sentence")
        return sentence
