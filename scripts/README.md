# Kakuti Development Scripts

This directory contains various scripts for setting up, running, and deploying the Kakuti application.

## Development Scripts

### Local Development (Conda)
```bash
# Setup environment and dependencies
bash scripts/dev.sh setup --env kakuti

# Start both frontend and backend
bash scripts/dev.sh start --env kakuti --port 8001

# Stop all services
bash scripts/dev.sh stop

# Check status
bash scripts/dev.sh status
```

### Local Development (Python venv)
```bash
# Setup environment and dependencies
bash scripts/dev-venv.sh setup

# Start both frontend and backend
bash scripts/dev-venv.sh start --port 8001

# Stop all services
bash scripts/dev-venv.sh stop
```

### Windows Development (PowerShell)
```powershell
# With Conda
powershell -File scripts/dev.ps1 setup -env kakuti
powershell -File scripts/dev.ps1 start -env kakuti

# With Python venv
powershell -File scripts/dev-venv.ps1 setup
powershell -File scripts/dev-venv.ps1 start
```

## Docker Fullstack Deployment

The fullstack Docker setup combines both frontend and backend into a single container with Nginx as a reverse proxy.

### Quick Start
```bash
# Build the image
bash scripts/docker-fullstack.sh build

# Start the container
export GEMINI_API_KEY="your-api-key"
bash scripts/docker-fullstack.sh start --port 8080

# Access the application at http://localhost:8080
```

### Using Environment File
```bash
# Copy and configure environment file
cp scripts/env.docker.example .env.docker
# Edit .env.docker with your API keys

# Start with environment file
bash scripts/docker-fullstack.sh start --env-file .env.docker
```

### Windows Docker
```powershell
# Build and start
powershell -File scripts/docker-fullstack.ps1 build
$env:GEMINI_API_KEY="your-api-key"
powershell -File scripts/docker-fullstack.ps1 start -Port 8080
```

## Docker Commands Reference

### Linux/macOS
```bash
# Build image
bash scripts/docker-fullstack.sh build

# Run in foreground (for debugging)
bash scripts/docker-fullstack.sh run

# Start as daemon (background)
bash scripts/docker-fullstack.sh start

# View logs
bash scripts/docker-fullstack.sh logs --follow

# Open shell in container
bash scripts/docker-fullstack.sh shell

# Stop container
bash scripts/docker-fullstack.sh stop

# Restart container
bash scripts/docker-fullstack.sh restart

# Clean up (remove container and image)
bash scripts/docker-fullstack.sh clean
```

### Windows PowerShell
```powershell
# Build image
powershell -File scripts/docker-fullstack.ps1 build

# Start as daemon
powershell -File scripts/docker-fullstack.ps1 start

# View logs
powershell -File scripts/docker-fullstack.ps1 logs -Follow

# Open shell
powershell -File scripts/docker-fullstack.ps1 shell

# Stop container
powershell -File scripts/docker-fullstack.ps1 stop

# Clean up
powershell -File scripts/docker-fullstack.ps1 clean
```

## Architecture

### Fullstack Docker Container
- **Frontend**: React + Vite application served by Nginx
- **Backend**: FastAPI application running on uvicorn
- **Reverse Proxy**: Nginx handling routing and static files
- **Process Manager**: Supervisor managing both services
- **Database**: SQLite for development (persistent storage via volumes)

### Service Architecture
```
Port 8080 (External)
       ↓
   Nginx Reverse Proxy
       ↓
   ┌─────────────────┬─────────────────┐
   │   Frontend      │    Backend      │
   │   Static Files  │    Port 8001    │
   │   (React)       │    (FastAPI)    │
   └─────────────────┴─────────────────┘
```

## Environment Variables

### Required
- `GEMINI_API_KEY` - Google Gemini API key for AI features
- `API_KEY` - Custom API key (if REQUIRE_API_KEY=true)

### Optional
- `REQUIRE_API_KEY` - Enable API key authentication (default: true)
- `LLM_PROVIDER` - LLM provider (default: gemini)
- `RAG_SIMILARITY_THRESHOLD` - RAG similarity threshold (default: 0.65)
- `PORT` - External port for Docker container (default: 8080)

## File Structure
```
scripts/
├── dev.sh                    # Conda development script (Linux/macOS)
├── dev.ps1                   # Conda development script (Windows)
├── dev-venv.sh              # Python venv script (Linux/macOS)  
├── dev-venv.ps1             # Python venv script (Windows)
├── docker-fullstack.sh      # Docker fullstack script (Linux/macOS)
├── docker-fullstack.ps1     # Docker fullstack script (Windows)
├── Dockerfile.fullstack     # Multi-stage fullstack Dockerfile
├── nginx.conf               # Nginx configuration for container
├── supervisord.conf         # Supervisor configuration
├── start-fullstack.sh       # Container startup script
├── env.docker.example       # Example environment file
└── README.md               # This file
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Find and kill process using port
   lsof -ti :8080 | xargs kill
   ```

2. **Docker build fails**
   ```bash
   # Clean up Docker cache
   docker system prune -f
   docker builder prune -f
   ```

3. **Permission issues in container**
   ```bash
   # Check container logs
   bash scripts/docker-fullstack.sh logs
   ```

4. **API key not working**
   - Ensure `GEMINI_API_KEY` is set correctly
   - Check logs for authentication errors
   - Verify API key has necessary permissions

### Development Tips

1. **Auto-restart on changes**: Use the local development scripts for hot reloading
2. **Production testing**: Use Docker for testing production-like environment
3. **Debugging**: Use `shell` command to inspect container internals
4. **Log monitoring**: Use `logs --follow` to monitor real-time logs

## Support

For issues and questions:
1. Check the logs using the `logs` command
2. Verify environment configuration
3. Ensure all required dependencies are installed
4. Check Docker daemon is running (for Docker deployment)
