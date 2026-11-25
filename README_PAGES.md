# GitHub Pages presentation

Publish the repository root to GitHub Pages. The slides load recorded experiment assets over HTTP. For a local preview, run `.\.venv\Scripts\python.exe -m http.server 8000 --bind 127.0.0.1` and open `http://127.0.0.1:8000`. Use Left and Right Arrow or the on-screen buttons to advance.

Run the local integrity check from PowerShell:

```powershell
.\verify.ps1
```

The what-if slide uses the recorded model scores for one-feature perturbations. LIME and Kernel SHAP charts use the four saved local cases. The correlation heatmap uses the 500 aligned RAID rows in the PDP export.

Rebuild from PowerShell in the repository root with Python 3.11 and uv:

```powershell
$env:UV_CACHE_DIR = "$PWD\.runtime\cache"
$env:UV_PYTHON_INSTALL_DIR = "$PWD\.runtime\python"
$env:HF_HOME = "$PWD\.runtime\hf"
$env:MPLCONFIGDIR = "$PWD\.runtime\matplotlib"
uv venv --python 3.11 .venv
uv pip install --python .venv\Scripts\python.exe -r requirements.txt
$env:TEMP = "$PWD\.runtime"
$env:TMP = "$PWD\.runtime"
.\.venv\Scripts\python.exe feature_correlation.py
.\.venv\Scripts\python.exe verify_literature.py
.\.venv\Scripts\python.exe recover_sample.py
```

After reviewing the pinned model and digest in `models/README.md`, enable its loader for this shell and run:

```powershell
$env:ALLOW_PICKLE_MODEL = '1'
.\.venv\Scripts\python.exe evaluate_stability.py
.\.venv\Scripts\python.exe evaluate_audit.py
```

Recovering the exact sample streams the pinned RAID split and can take considerable time. The site reads aggregate outputs. Git ignores the runtime, model cache, and recovered text.
