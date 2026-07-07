from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
import torch

app = FastAPI()

MODEL_NAME = "plxgplxg/nllb-zh-vi-merged"

# Load tokenizer từ model gốc vì tokenizer của model merge bị lỗi TokenizersBackend khi push
tokenizer = AutoTokenizer.from_pretrained("facebook/nllb-200-distilled-600M", src_lang="zho_Hans", tgt_lang="vie_Latn")
model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)
model.eval()

class TranslateRequest(BaseModel):
    inputs: str
    parameters: dict | None = None

@app.get("/")
def health():
    return {"status": "ok", "model": MODEL_NAME}

@app.post("/")
def translate(req: TranslateRequest):
    if not req.inputs or not req.inputs.strip():
        raise HTTPException(status_code=400, detail="inputs is required")

    params = req.parameters or {}
    max_length = params.get("max_length", 512)

    inputs = tokenizer(req.inputs, return_tensors="pt", truncation=True, max_length=max_length)
    forced_bos_token_id = tokenizer.convert_tokens_to_ids("vie_Latn")

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            forced_bos_token_id=forced_bos_token_id,
            max_length=max_length,
            num_beams=4
        )

    result_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return [{"translation_text": result_text}]
