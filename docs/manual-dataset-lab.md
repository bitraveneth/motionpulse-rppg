# Manual dataset lab

This is the work you do in Terminal, on your own computer, without the website reading your videos. A teacher can follow the same steps. Keep the Terminal window and the files it writes. Those are the evidence.

The website at `http://127.0.0.1:4731/local-lab` opens a folder window. Press Load dataset, choose the unzipped folder, then choose a method. Two methods are available: CHROM and POS. Choose one, or both. Press Run. The face is read once. Each result is labeled with the method that produced it. Run reads a video, or a PURE folder of images plus its JSON pulse rate, and fills MAE, RMSE, Pearson r, SNR, and Bland–Altman from the camera heart rate and the file heart rate. It does not open a zip, and it does not upload the files.

## What you can claim, and what you cannot

You can claim:

- You installed a Python environment.
- You placed a dataset in a folder and listed what is inside it.
- You read the dataset’s own ground-truth file and wrote a separate label table.
- You ran the synthetic smoke test, and you label that result as synthetic.

You cannot claim, until the real loader exists:

- That `npm run batch` measured heart rate from the dataset video. Without a companion trace file, that command uses a **synthetic stand-in** seeded by the file path. Those BPM numbers are not UBFC, PURE, or MMPD results.
- That the Python UBFC, PURE, or MMPD trainer has learned anything. Those loaders stop on purpose and say they are not wired yet.
- That research questions 1–4 are answered. They are not.

The line `folder /tmp/mp-batch-demo` on the website was a practice clip from 21 Oct 2026. It is not your dataset.

## 0. Open the project

The project folder on this Mac is:

```bash
cd /Users/alex/STUDY/Apps/motionpulse-rppg
```

Check that you are in the right place:

```bash
pwd
ls research docs package.json
```

You should see `research`, `docs`, and `package.json`.

## 1. Install the Python environment

You need Python 3.9 or newer. Check:

```bash
python3 --version
```

Create a virtual environment inside the project. Do this once.

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -U pip
python3 -m pip install -r requirements-research.txt
python3 -m pip install -e .
```

Every new Terminal window must activate the environment again:

```bash
cd /Users/alex/STUDY/Apps/motionpulse-rppg
source .venv/bin/activate
```

The prompt then starts with `(.venv)`. Screenshot `python3 --version` and `python3 -c "import torch, numpy, yaml; print('ok', torch.__version__)"` for your notes.

## 2. Prove the environment on synthetic data

This does **not** use your videos. Say that in the note you show a teacher.

```bash
python3 -m research.train --config research/configs/synthetic.yaml
python3 -m research.eval --config research/configs/synthetic.yaml
python3 -m research.rq1_conflict_analysis --config research/configs/synthetic.yaml
```

Outputs go to `research/out/`. They are a smoke test: the code runs. They are not a dataset result.

## 3. Put the real dataset in a folder

Download UBFC-rPPG yourself from the official page:

https://sites.google.com/view/ybenezeth/ubfcrppg

Do not commit the download. `data/` is gitignored.

Unzip it so the videos are visible. A usual layout is:

```text
data/UBFC/subject1/vid.avi
data/UBFC/subject1/ground_truth.txt
data/UBFC/subject2/vid.avi
data/UBFC/subject2/ground_truth.txt
```

PURE and MMPD, if you have permission to use them, go in `data/PURE` and `data/MMPD`.

On the website, press **Choose folder**, pick that unzipped folder, then press **Start**. The card lists the files, then reads each video with the face algorithm. A line like `subject1 · camera 86.1 · file 97.0` is a real pair. MAE, RMSE, Pearson r, SNR, and Bland–Altman use those pairs, and the four research questions get a short answer and a graph from the same run. A `.zip` stays closed, and the original files are not edited. Forty-two videos take a long time because each frame is checked for a face. Each finished subject is saved as a card — heart rate, breath, signal, length, motion, spectrum, and trust — with the date and time. Open **Test results** at `/results`. Those rows are in the database and contain no video. They are not posts on the news feed.

## 4. Look at the folder before any model

From the project folder:

```bash
find data/UBFC -name '.DS_Store' -delete
find data/UBFC -type d -name '__MACOSX' -print
find data/UBFC \( -iname '*.avi' -o -iname '*.mp4' -o -iname '*.mov' \) | wc -l
find data/UBFC -iname 'ground_truth.txt' | wc -l
find data/UBFC -iname 'ground_truth.txt' | head
```

Write the two counts in your lab note: number of videos, number of ground-truth files.

If `__MACOSX` is printed, it is a junk folder from macOS zip. You may delete only that junk folder:

```bash
find data/UBFC -type d -name '__MACOSX' -exec rm -rf {} +
```

Do not delete a subject folder because a name looks odd. Move it aside and write why:

```bash
mkdir -p data/UBFC-skipped
# example only — use the real folder name
# mv data/UBFC/subject-broken data/UBFC-skipped/
```

In `data/UBFC-skipped/WHY.txt`, one line per move: the folder name, the date, and the reason (no video, unreadable file, duplicate).

## 5. Read the ground truth and write a label table

Do not edit `ground_truth.txt`. The original file is the dataset. You write a new table beside it.

Many official UBFC subject folders use a text file with **three rows**:

1. the pulse waveform
2. heart-rate values, in BPM
3. time

Your copy might differ. The script below checks. If row 2 does not average between 40 and 180 BPM, it does **not** invent a label. It writes `CHECK` and you open that file yourself.

```bash
mkdir -p data/labels
python3 - << 'PY'
from pathlib import Path
root = Path("data/UBFC")
out = Path("data/labels/ubfc-labels.csv")
lines = ["subject,video,ground_truth_file,reference_bpm,decision,note"]
if not root.exists():
    raise SystemExit(f"Missing {root.resolve()}")
for gt in sorted(root.rglob("ground_truth.txt")):
    subject = gt.parent.name
    videos = list(gt.parent.glob("*.avi")) + list(gt.parent.glob("*.mp4"))
    video = videos[0].name if videos else ""
    rows = []
    for raw in gt.read_text(errors="replace").splitlines():
        nums = []
        for part in raw.replace(",", " ").split():
            try:
                nums.append(float(part))
            except ValueError:
                pass
        if nums:
            rows.append(nums)
    decision, bpm, note = "CHECK", "", "open the file; row 2 was not a plausible BPM series"
    if len(rows) >= 2 and rows[1]:
        avg = sum(rows[1]) / len(rows[1])
        if 40 <= avg <= 180:
            decision, bpm, note = "USE", f"{avg:.1f}", "mean of row 2; original file not edited"
    lines.append(f"{subject},{video},{gt.as_posix()},{bpm},{decision},{note}")
out.write_text("\n".join(lines) + "\n")
print(f"Wrote {out} ({len(lines)-1} rows)")
PY
```

Open `data/labels/ubfc-labels.csv`. Every `CHECK` row needs you to look at the file and decide. If you know the reference from a device or from the dataset paper, add the number in a copy of the CSV and set `decision` to `HAND`. Do not change the downloaded `ground_truth.txt`.

Relabel only when:

- the ground-truth file is missing
- the script says `CHECK`
- two copies of the same subject disagree

If the file is already a clear BPM series, leave it. Relabeling a correct file makes the result worse.

## 6. What the website batch command actually does

This command is in the project, and the website can copy it:

```bash
npm run batch -- data/UBFC
```

Read the printed lines. If a line says `synthetic_proxy`, that heart rate was **not** measured from the picture. The program did not run face tracking. It invented a stand-in so the file format could be tested. Do not put those numbers in a thesis table.

A real camera estimate from this repository needs face traces exported by the scan page (`*.motionpulse.json` next to the video). The dataset videos you downloaded do not include those traces.

The Python trainer for UBFC is also not ready. If the folder exists, this command is expected to stop:

```bash
python3 -m research.train --config research/configs/ubfc.yaml
```

The stop message says the loader is stubbed. Save that message. It shows you did not pretend the model trained.

## 7. What to keep for a teacher

One folder, `notes/lab-log/`, with:

- the screenshot of `python3 --version` and the torch import
- the output of the three synthetic commands, labeled “synthetic smoke test”
- `find` counts of videos and ground-truth files
- `data/labels/ubfc-labels.csv`
- `data/UBFC-skipped/WHY.txt` if you moved anything
- the UBFC trainer stop message, if you ran it

That packet shows the environment, the data, and the labels. It does not show a finished heart-rate result, because the project does not have one from the raw dataset yet.
