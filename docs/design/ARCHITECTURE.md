# ARCHITECTURE OF MOU management system

## Key Architecture Guidelines

Always follow the decisions in `ADR.md`

### Modules

- each folder in the `src` represents a module or a submodule
- modules must have acyclic dependency
- Higher layer modules can depend on lower layer module
- Modules in the Same layer cannot depend on each other

### Implementation guidelines

- Generate the top level file (containing the main or entry point function) for application in the `src/` folder.
- Generate and update package design diagram in `docs/design/packagedesign.md` when a new package is added to the system. The file will be in markdown format and diagrams in mermaid.js format.

## Technology Stack

backend : expressjs
frontend : react vite v19.2.8
unit test framework : playwright v1.62
web server : nginx
Other tools/libraries/frameworks : (tailwindcss, )
package managers: npm

## Technolgy stack specific instructions for Code generation

## Development Setup

IDE : VSCode

## Deployment Setup

Deployment system: Azure Container apps (docker deployment)
Operating System : Linux

## Design Documents

- `docs/design/sourcemap.md` : list of source code files and their purpose. Use this information to decide which files to modify or update during the code generation.
