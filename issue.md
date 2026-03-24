# Issue: Modernization of Backend Architecture (NodeJS/ExpressJS to Bun/ElysiaJS)

## Objective
Transition the current backend from NodeJS with ExpressJS to **Bun** runtime with **ElysiaJS** framework to achieve superior performance, type safety, and modern developer experience.

## Proposed Changes

### 1. Runtime Transition
- Replace NodeJS with **Bun** as the primary runtime.
- Update `package.json` scripts to use `bun` (e.g., `bun run server.ts`).
- Leverage Bun's built-in SQLite support or optimized drivers for MySQL.

### 2. Framework Migration (ExpressJS to ElysiaJS)
- Re-implement existing routes from `server.js` using **ElysiaJS**.
- Utilize Elysia's schema validation (TypeBox) for robust API input/output.
- Migrate middleware (Authentication, CORS, Rate Limiting) to Elysia plugins.

### 3. Implementation Steps
1. **Setup Bun Environment**: Initialize a new Bun project and install `elysia`.
2. **Database Connection Migration**: Update the database utility to work seamlessly with Bun's runtime.
3. **Route Migration**: Systematically migrate endpoints, starting with public APIs, then protected equipment and branch APIs.
4. **Authentication**: Re-implement JWT authentication using Elysia's `@elysiajs/jwt` plugin.
5. **Testing**: Perform stress testing to compare performance improvements before and after the migration.

## Junior Programmer / AI Model Guidance
- Start by creating a simple "Hello World" Elysia server to understand the structure.
- Use Elysia's official documentation for plugin integrations.
- Ensure all environment variables (`DB_HOST`, `JWT_SECRET`) are correctly handled using `process.env` or Bun's native `.env` support.
