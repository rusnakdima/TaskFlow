# Task Flow

Task Flow is a productivity application built with [Tauri](https://tauri.app/) that helps users manage and organize their tasks efficiently. The application provides a clean, intuitive interface for creating, tracking, and completing tasks with cross-platform support.

## Screenshots

<details>
  <summary>Spoiler</summary>
  <details>
    <summary>Authentication</summary>
    <h3>Login page</h3>
    <img src="imgREADME/login.png" alt="Login">
    <h3>Sign Up page</h3>
    <img src="imgREADME/signup.png" alt="Sign Up">
    <h3>Reset Password page</h3>
    <img src="imgREADME/reset-password.png" alt="Reset Password">
  </details>
  <details>
    <summary>Main Views</summary>
    <h3>Home page</h3>
    <img src="imgREADME/home.png" alt="Home">
    <h3>Projects page</h3>
    <img src="imgREADME/projects.png" alt="Projects">
    <h3>Profile page</h3>
    <img src="imgREADME/profile.png" alt="Profile">
    <h3>About page</h3>
    <img src="imgREADME/about.png" alt="About">
  </details>
  <details>
    <summary>Task Management</summary>
    <h3>Tasks List</h3>
    <img src="imgREADME/list-tasks.png" alt="Tasks List">
    <h3>Subtasks List</h3>
    <img src="imgREADME/list-subtasks.png" alt="Subtasks List">
    <h3>Kanban Board</h3>
    <img src="imgREADME/kanban-board.png" alt="Kanban Board">
  </details>
  <details>
    <summary>Features</summary>
    <h3>Calendar View</h3>
    <img src="imgREADME/calendar.png" alt="Calendar">
    <h3>Statistics</h3>
    <img src="imgREADME/stats.png" alt="Statistics">
    <h3>Categories</h3>
    <img src="imgREADME/categories.png" alt="Categories">
    <h3>Sync Settings</h3>
    <img src="imgREADME/sync.png" alt="Sync">
    <h3>Shared Tasks</h3>
    <img src="imgREADME/shared-tasks.png" alt="Shared Tasks">
  </details>
</details>

## Installation

#### Checking the installed tools to launch the project

First make sure you have Node.js and Bun installed.
To do this, open a command prompt or terminal and type the following commands:

```bash
node -v
```

```bash
npm -v
```

If you are using the bun package manager, then run this command:

```bash
bun -v
```

#### Installation dependencies

After that, go to the folder with this project and run the following command:

```bash
npm install
```

If you are using the bun package manager, then run this command:

```bash
bun install
```

#### Checking the Rust compiler

In order to run a Rust application, you need to make sure that you have a compiler for Rust.
To find out if you have one, enter the following command:

```bash
rustc --version
```

If you get an error instead of a version, it means that you don't have a Rust compiler. In order to set it up, go to the [official website](https://www.rust-lang.org/tools/install) and follow the instructions on the website.

## Usage

After installing the dependencies, use the following command to run, depending on the package manager you are using:

```bash
npm run tauri dev
```

Or

```bash
bun run tauri dev
```

## Build Optimization

This project includes several optimizations to reduce build times and avoid unnecessary recompilation of Tauri components:

### Smart Build Scripts

Use the optimized build scripts that only rebuild components when source files have changed:

```bash
# Build desktop application (only rebuilds if files changed)
bun run build:smart

# Build desktop debug version
bun run build:smart:debug

# Build Android APK (only rebuilds if files changed)
bun run build:smart:android

# Build Android APK debug version
bun run build:smart:android:debug

# Clean all build artifacts and cache
bun run build:clean
```

### Traditional Build Scripts

For comparison, traditional build scripts are still available:

```bash
# Standard desktop build (always rebuilds everything)
bun run tauri:build

# Android APK build
bun run tauri:build:android:apk

# Android AAB build
bun run tauri:build:android:aab
```

### Build Optimizations Applied

1. **Incremental Compilation**: Rust code uses incremental compilation to avoid recompiling unchanged code
2. **Smart Frontend Building**: Frontend is only rebuilt when source files change
3. **Optimized Codegen Units**: Development builds use 16 codegen units for faster compilation
4. **Build Caching**: Build timestamps are tracked to determine what needs rebuilding
5. **CI/CD Integration**: The same optimized build script works in GitHub Actions for consistent builds across all platforms (desktop, Android, iOS)

## Authors

- [Dmitriy303](https://github.com/rusnakdima)

## License

This project is licensed under the [MIT License](LICENSE.MD).

## Contact

If you have any questions or comments about this project, please feel free to contact us at [rusnakdima03@gmail.com](mailto:rusnakdima03@gmail.com).
