# Frontend Testing Guide

## Running Tests

```bash
cd client
npm install
npm test          # Run tests in watch mode
npm run test:ui   # Run with interactive UI
```

## What's Tested

### Login Component (`Login.test.jsx`)

**Basic Rendering:**
- ✅ Form elements render correctly
- ✅ Input fields update on user typing

**User Interactions:**
- ✅ Successful login calls API and navigates
- ✅ Failed login shows error alert
- ✅ Empty form submission handled

## Test Structure

```
client/
├── vitest.config.js       # Vitest configuration
├── src/
│   ├── test/
│   │   └── setup.js       # Test setup (jest-dom matchers)
│   └── components/
│       └── Login.test.jsx # Login component tests
```

## Key Testing Libraries

- **Vitest**: Fast test runner for Vite projects
- **React Testing Library**: Component testing with user-centric approach
- **@testing-library/jest-dom**: Additional matchers for DOM assertions

## Adding More Tests

Follow the same pattern for other components:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

describe('YourComponent', () => {
  it('does something', () => {
    render(<YourComponent />);
    // Your assertions
  });
});
```

## Best Practices

1. **Test user behavior**, not implementation
2. **Mock external dependencies** (API, context, navigation)
3. **Use accessible queries** (getByRole, getByLabelText)
4. **Wait for async updates** (waitFor, findBy queries)
5. **Keep tests simple** - one concept per test
