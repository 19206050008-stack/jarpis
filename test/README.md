# Anta AI - Test Automation Suite

## Struktur Folder

```
test/
├── README.md
├── scenarios/          # Skenario test per fitur
│   └── scenarios.json
├── testcases/          # Test cases detail
│   └── testcases.json
├── teststeps/          # Test steps per case
│   └── teststeps.json
├── uat/                # User Acceptance Test
│   └── uat.json
├── scripts/            # Script automation (Playwright)
│   ├── run-all.mjs
│   ├── helpers/
│   │   └── browser.mjs
│   ├── utils/
│   │   └── reporter.mjs
│   └── suites/
│       ├── orb.test.mjs
│       ├── chat.test.mjs
│       ├── voice.test.mjs
│       ├── search.test.mjs
│       └── features.test.mjs
└── output/             # Hasil test (generated)
    ├── results.json
    └── results.xlsx
```

## Cara Jalankan

```bash
cd test
node scripts/run-all.mjs
```

Output akan muncul di `test/output/results.json` dan `test/output/results.xlsx`.
