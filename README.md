# watup.lk

A monorepo managed with [Meta](https://github.com/mateodelnorte/meta) containing multiple services for the watup.lk platform.

## Projects

This monorepo contains the following projects:
- **watup-fe**: Frontend application
- **identity-service**: Identity and authentication service

## Prerequisites

⚠️ **Important**: This project requires **Node.js v18.17.x** due to compatibility issues with Meta on newer Node versions.

You can use [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager) to manage multiple Node versions:

```bash
# Install Node v18.17.x
nvm install 18.17.0
nvm use 18.17.0
```

### Install Meta Globally

Meta must be installed globally to manage this monorepo:

```bash
npm install -g meta
```


## Getting Started

### First Time Setup

If you're setting up this project for the first time:

1. **Clone the meta repository**:
   ```bash
   git clone https://github.com/watup-lk/watup.lk.git
   cd watup.lk
   ```

2. **Install Meta dependencies**:
   ```bash
   npm i
   ```

3. **Clone all child repositories**:
   ```bash
   meta git update
   ```

This will clone all the repositories defined in the `.meta` file into their respective directories.

### Updating Repositories

To pull the latest changes from all repositories:

```bash
meta git update
```

## Working with Meta

Meta allows you to run git commands across all child repositories simultaneously.

### Common Commands

- **Check status of all repos**:
  ```bash
  meta git status
  ```

- **Pull latest changes**:
  ```bash
  meta git pull
  ```

- **Create a branch across all repos**:
  ```bash
  meta git checkout -b feature/new-feature
  ```

- **Run npm commands across all repos**:
  ```bash
  meta npm install
  meta npm run build
  ```

- **Execute custom commands**:
  ```bash
  meta exec "your-command-here"
  ```

## Project Structure

```
watup.lk/
├── .meta                 # Meta configuration file
├── watup-fe/            # Frontend application
├── identity-service/    # Identity service
├── package.json         # Meta dependencies
└── README.md           # This file
```

## Additional Resources

- [Meta Documentation](https://github.com/mateodelnorte/meta)
- [Meta Git Plugin](https://github.com/mateodelnorte/meta-git)

## Contributing

When contributing to this monorepo, please ensure you:
1. Keep all repositories in sync
2. Test changes across affected services
3. Follow the established coding standards for each project
