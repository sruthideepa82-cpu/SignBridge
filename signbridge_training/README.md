# SignBridge – first training run

1. `pip install -r requirements.txt`
2. Get a public ISL word-level video dataset (e.g. AI4Bharat INCLUDE). Check its license.
   Arrange as DATA_ROOT/<word>/<clip>.mp4. Start with 10-20 words, not all of them.
3. `python 01_extract_landmarks.py DATA_ROOT out/landmarks.npz --class-depth 2 --only "Yellow,Bird,..."` (INCLUDE layout; for flat DATA_ROOT/<word>/ use depth 1)
   (adjust the regex so it captures the signer id from the filename; if the dataset has
   no signer id, results are optimistic because the same person is in train and test)
4. `python 02_train.py out/landmarks.npz --out model/`
5. Read: top-1 / top-3 on unseen signers, the "most confused" list, model/model_card.json.

`make_synthetic.py` makes fake data to check the scripts run. Its 100% means nothing.

## Connecting the model to Live Studio

02_train.py writes model/model.joblib and model/model_card.json. The SignBridge backend loads them at startup and
serves predictions at GET /api/recognition/sequence. Live Studio shows "Model unavailable" until the files exist.

- The model card must not have "synthetic": true. Synthetic models are refused by the server.
- The backend reads the folder from SIGNBRIDGE_SEQUENCE_MODEL_DIR (default: this folder's model/).
- Words are shown only when the model's confidence is at least SIGNBRIDGE_SEQUENCE_THRESHOLD (default 0.6).
- A word appears in the sentence only after it is held steady for several results (see frontend/src/lib/sentenceBuilder.js).
- The model card's caveat is shown in Live Studio. Check it before relying on the output.
