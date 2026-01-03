import asyncio
import datetime
import random
from fastapi import FastAPI, WebSocket
from starlette.websockets import WebSocketDisconnect
import uvicorn

app = FastAPI()

# Function to generate random OHLCV data
def generate_ohlcv():
    return {
        "time": datetime.datetime.now().isoformat(),
        "open": random.uniform(100, 200),
        "high": random.uniform(200, 300),
        "low": random.uniform(50, 100),
        "close": random.uniform(100, 200),
        "volume": random.uniform(1000, 5000)
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Generate and send OHLCV data
            ohlcv_data = generate_ohlcv()
            await websocket.send_json(ohlcv_data)
            await asyncio.sleep(1)  # Send data every second
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await websocket.close()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
