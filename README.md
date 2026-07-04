# CodeDungeon Judge Server

Dockerized C++ judge server for Code Dungeon. This server receives C++ code from users, compiles it within a secure Docker container, runs it against provided test cases, and returns the result.

## Prerequisites

- Node.js
- Docker (must be running on your system for code compilation and execution)

## Setup

1. Build the Docker sandbox image:
This image is required to run C++ code securely in an isolated environment.
```bash
docker build -t cpp-runner .
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

The server will run by default on port `5000` (or `9090` based on the configuration).
