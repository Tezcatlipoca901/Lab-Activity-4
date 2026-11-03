# Brewlist – Catppuccin task manager (vanilla HTML/CSS/JS)

```
brewlist/
├── template/index.html   ← HTML
├── design/styles.css     ← CSS
├── script/app.js         ← JavaScript
└── assets/               ← icons (from your ZIP) + Inter font
```

## Run
Open `template/index.html` in a browser, or serve the folder:

    cd brewlist && python3 -m http.server 8000
    # then visit http://localhost:8000/template/index.html

Tasks, categories and theme are saved in localStorage (clear it to reset the seed data).
