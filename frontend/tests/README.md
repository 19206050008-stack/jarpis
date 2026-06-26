# Anta E2E Test Suite

Automated end-to-end testing untuk memastikan semua fitur Anta berfungsi dengan baik.

## Setup

```bash
cd frontend
npm install
```

## Run Tests

```bash
# Run tests (headless)
npm test

# Run tests dengan browser visible (untuk debugging)
npm run test:headed
```

## Test Coverage

Test suite ini mencakup:

1. ✅ Page loading
2. ✅ Orb visibility
3. ✅ Dock navigation
4. ✅ Chat window toggle
5. ✅ Chat input functionality
6. ✅ Send message
7. ✅ Close chat window
8. ✅ Web viewer toggle
9. ✅ Viewer close
10. ✅ Subtitle bubble system
11. ✅ Orb drag interaction
12. ✅ Mobile viewport layout
13. ✅ Mobile chat slide-up

## Environment Variables

```bash
TEST_URL=http://localhost:3000  # Default, can be changed to production URL
```

## CI/CD Integration

Test ini dapat diintegrasikan ke GitHub Actions atau CI pipeline lainnya:

```yaml
- name: Install dependencies
  run: cd frontend && npm install

- name: Install Playwright
  run: npx playwright install chromium

- name: Run E2E tests
  run: cd frontend && npm test
```
