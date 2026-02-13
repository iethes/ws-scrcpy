# AGENTS.md

This file contains guidelines for agentic coding assistants working on this repository.

## Build Commands

### Development

-   `npm run dist:dev` - Build development bundle
-   `npm run dist:prod` - Build production bundle
-   `npm run dist` - Alias for production build
-   `npm run clean` - Remove dist directory

### Server

-   `npm start` - Build and start the server
-   `cd dist && npm start` - Start the built server

### Code Quality

-   `npm run lint` - Run ESLint on src/ directory
-   `npm run format` - Auto-fix formatting issues with ESLint

### Testing

No tests are currently configured. The test command returns an error.

## Code Style Guidelines

### TypeScript Configuration

-   Strict mode enabled (`strict: true`)
-   Target: ES5, Module: commonjs
-   Libraries: ES2017, DOM
-   No unused locals/parameters allowed
-   No implicit returns allowed
-   Source maps enabled, comments removed in output

### Imports

-   Node modules: Use `import * as name from 'module'` (e.g., `import * as fs from 'fs'`)
-   Default imports: Use for packages that export default (e.g., `import YAML from 'yaml'`)
-   Local modules: Use relative imports (e.g., `import { Config } from './Config'`)
-   Type imports: Can be imported alongside values (no separate `import type` required)

### Formatting (Prettier)

-   Semi-colons: enabled
-   Trailing commas: all
-   Single quotes: enabled
-   Print width: 120 characters
-   Tab width: 4 spaces

### Naming Conventions

-   Classes: PascalCase (e.g., `Config`, `Device`, `TypedEmitter`)
-   Interfaces: PascalCase (e.g., `DeviceEvents`, `Message`)
-   Enums: PascalCase (e.g., `PID_DETECTION`)
-   Variables/properties: camelCase (e.g., `updateTimeout`, `descriptor`)
-   Constants: UPPER_SNAKE_CASE (e.g., `MAX_UPDATES_COUNT`, `INITIAL_UPDATE_TIMEOUT`)
-   Private members: prefix with `private` keyword
-   Static methods: `public static methodName()`

### Error Handling

-   Throw errors with descriptive messages: `throw Error('Cannot find file')`
-   Use `console.error()` for logging errors
-   Use `console.log()` for informational messages with TAG prefix: `console.log(this.TAG, 'message')`
-   Async methods use try/catch blocks where appropriate
-   Promise chains use `.catch()` for error handling

### Class Structure

1. Import statements
2. Enums (if any)
3. Event interfaces (for TypedEmitter classes)
4. Class declaration
5. Public static readonly constants
6. Private static methods
7. Constructor
8. Public getter methods
9. Public methods
10. Private methods

### Access Modifiers

-   Always specify access modifiers: `public`, `private`, or `protected`
-   Use `private` for internal methods and properties
-   Use `public static readonly` for constants

### Asynchronous Code

-   Use `async/await` pattern
-   Return `Promise<T>` for async methods
-   Use `.then()` and `.catch()` where appropriate in callback chains

### Event Handling

-   Classes that emit events extend `TypedEmitter<T>` where `T` is an interface mapping event names to data types
-   Define event interface: `interface ClassNameEvents { eventName: DataType }`
-   Emit events: `this.emit('eventName', data)`
-   Use typed event handlers with EventListener pattern

### Directory Structure

-   `src/server/` - Node.js server code
-   `src/app/` - Frontend/client code
-   `src/common/` - Shared utilities and types
-   `src/types/` - TypeScript type definitions (.d.ts files)
-   `src/packages/` - Reusable packages

### Conditional Compilation

-   Use `/// #if FLAG_NAME` and `/// #endif` for conditional compilation
-   Flags are defined in `build.config.override.json`
-   Examples: `INCLUDE_GOOG`, `INCLUDE_APPL`, `USE_WEBCODECS`

### Webpack Configuration

-   Frontend: Uses HtmlWebpackPlugin, MiniCssExtractPlugin
-   Backend: Uses nodeExternals(), GeneratePackageJsonPlugin
-   Common: Handles TypeScript, CSS, SVG, assets via ts-loader and ifdef-loader

### General Guidelines

-   Avoid `any` types unless necessary (use eslint-disable comment sparingly)
-   Prefer `const` over `let`
-   Use arrow functions for callbacks: `() => {}`
-   Method chaining with `.then()` for Promise sequences
-   Console logging for debugging with context-aware TAGs
