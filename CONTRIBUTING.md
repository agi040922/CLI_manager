# Contributing to CLI Manager

Thank you for your interest in contributing! This document covers how to report issues, submit pull requests, and follow the project conventions.

## Reporting Issues

1. Search [existing issues](https://github.com/woorichicken/CLI_manager/issues) to avoid duplicates.
2. Open a new issue with a clear title and description.
3. Include steps to reproduce, expected behavior, and actual behavior.
4. Attach screenshots or logs if applicable.

## Submitting a Pull Request

1. Fork the repository and create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes following the coding conventions below.
3. Run type checks before submitting:
   ```bash
   pnpm typecheck
   ```
4. Build the app to verify there are no build errors:
   ```bash
   pnpm build
   ```
5. Commit your changes with a clear message (see commit conventions below).
6. Push to your fork and open a pull request against `main`.
7. Describe what your PR does and why in the pull request description.

## Development Environment Setup

### Prerequisites

- Node.js v18 or later
- pnpm v8 or later
- Git
- gh CLI (optional, for GitHub integration features)

### Setup

```bash
# Clone the repository
git clone https://github.com/woorichicken/CLI_manager.git
cd CLI_manager

# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

## Coding Conventions

### Language

- **Code, variable names, comments, UI text, and error messages** must be written in **English**.
- Explanations in PR descriptions or issue comments may use any language.

### Component Guidelines

- Keep single components under **300 lines**.
- Extract complex logic into custom hooks.
- Provide explicit TypeScript types for all props and state.
- Avoid code duplication — extract shared logic into utility functions or common components.
- Add JSDoc comments for complex logic.

### Code Style

- Use meaningful variable and function names.
- Prefer constants over magic numbers.
- Comments should explain *why*, not *what*.
- Follow existing patterns in the codebase (naming, error handling, import style).

### File Organization

- Components go in `src/renderer/src/components/`
- Custom hooks go in `src/renderer/src/hooks/`
- Shared types go in `src/shared/types.ts`
- Main process handlers go in `src/main/index.ts`

## Commit Message Conventions

Use clear, concise commit messages in the imperative mood:

```
feat: add session drag-and-drop reordering
fix: resolve terminal resize on window split
chore: bump electron to v30
docs: update README prerequisites
refactor: extract workspace sort logic into hook
```

Common prefixes:
- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `chore:` — build, tooling, or dependency changes
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `style:` — formatting, whitespace (no logic change)
- `test:` — adding or updating tests
