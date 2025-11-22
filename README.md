# Task Flow

This is a project on [Tauri](https://tauri.app/). 

## Screenshots

here are screenshots of this project

## Installation

#### Checking the installed tools to launch the project

First make sure you have Node.js and Bun installed.
To do this, open a command prompt or terminal and type the following commands:

```bash
node -v
```

```bash
bun -v
```

If Bun is not installed, you can install it from the [official website](https://bun.sh/). Here are the installation commands for different systems:

**For macOS and Linux:**
```bash
curl -fsSL https://bun.sh/install | bash
```

**For Windows (using PowerShell):**
```powershell
irm bun.sh/install.ps1 | iex
```

**For all platforms using npm:**
```bash
npm install -g bun
```

#### Installation dependencies

After that, go to the folder with this project and run the following command:

```bash
bun install
```

#### Checking the installed tools to launch the project

In order to run a Rust application, you need to make sure that you have a compiler for Rust.
To find out if you have one, enter the following command:

```bash
rustc --version
```

If you get an error instead of a version, it means that you don't have a Rust compiler. In oreder to set it up, go to the [official website](https://www.rust-lang.org/tools/install) and follow the instructions on the website.

## Usage

After installing the dependencies, use the following command to run:

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

### Performance Tips

- Use `bun run build:smart` for development builds to avoid unnecessary recompilation
- The first build will always take longer as it establishes the baseline
- Subsequent builds will be much faster if only small changes are made
- Use `bun run build:clean` if you encounter build issues or want to start fresh

## Authors

- [Dmitriy303](https://github.com/rusnakdima)

## License

This project is licensed under the [License Name](LICENSE.MD).

## Contact

If you have any questions or comments about this project, please feel free to contact us at [contact email](rusnakdima03@gmail.com).
