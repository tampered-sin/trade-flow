from fastapi import APIRouter, Request

router = APIRouter()

@router.post("/{provider}")
async def receive(provider: str, request: Request):
    payload = await request.json()
    return {"provider": provider, "received": True}