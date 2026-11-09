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
