# CodeDungeon Judge Server

Dockerized C++ judge server for Code Dungeon. This server receives C++ code from users, compiles it within a secure Docker container, runs it against provided test cases, and returns the result.

## Prerequisites

- Node.js
- Docker (must be running on your system for code compilation and execution)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

The server will run by default on port `5000`.
