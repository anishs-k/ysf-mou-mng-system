# MOU management system Development Environment Setup

Use this checklist for onboarding a new developer:

1. Review the tech stack in `docs/design/ARCHITECTURE.md`.
2. Verify required tools are installed (compiler/interpreter/build tools/dependencies).
3. If anything is missing:
   - Ask whether it is already installed and where.
   - If not installed, guide setup of required software and packages.
4. Create `environment.ps1` (Windows PowerShell), `environment.bat` (Windows cmd)
   or `environment.sh` (Unix) in the project root. `environment.ps1` and
   `environment.sh` already exist; all three are gitignored.
5. Ensure the environment file:
   - Adds required tool paths (e.g compiler, build tool, testing tools).
   - Sets required environment variables.
   - Defines repository paths (root, source, test).
   - Includes any stack-specific best practices.
6. Do not commit the environment file; add it to version control ignore rules.

## Running the app

The environment file must be **sourced into the current shell**, not executed as a
child process, or the variables it sets vanish with its own scope:

```powershell
# PowerShell - note the leading dot
. .\environment.ps1
npm run dev
```

```bash
# bash / Git Bash
source ./environment.sh && npm run dev
```

`npm run dev` is `turbo run dev`, which boots the API on port 3001 and the web
frontend on port 5173 together. Without the sourced environment the API exits
immediately with `DATABASE_URL must be set`, while Vite still starts - a half-up
stack that looks like it is working.

Docker Desktop must be running: Postgres lives in a container on host port 5434.
