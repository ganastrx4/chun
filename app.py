from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
from pymongo import MongoClient
from eth_account.messages import encode_defunct
from eth_account import Account

app = Flask(__name__)
CORS(app)

# =========================
# CONFIG
# =========================
APP_ID = "app_7686f9027d3e3c0b53d987a3caf1e111"
WORLDCOIN_URL = "https://developer.worldcoin.org/api/v1/verify"

MONGO_URI = os.getenv("MONGO_URI")
client = MongoClient(MONGO_URI)
db = client["charlycoin"]
usuarios = db["usuarios"]

# =========================
# VERIFY WORLD ID
# =========================
@app.route("/verify-world", methods=["POST"])
def verify_world():
    data = request.json

    payload = {
        "merkle_root": data["merkle_root"],
        "nullifier_hash": data["nullifier_hash"],
        "proof": data["proof"],
        "credential_type": data["credential_type"],
        "action": "login",
        "signal": "charlycoin_user"
    }

    try:
        r = requests.post(WORLDCOIN_URL, json=payload)
        result = r.json()

        if result.get("success"):
            return jsonify({"success": True})

        return jsonify({"success": False})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

# =========================
# GUARDAR USUARIO
# =========================
@app.route("/guardar_usuario", methods=["POST"])
def guardar_usuario():
    data = request.json

    wallet = data.get("wallet")
    firma = data.get("firma")
    mensaje = data.get("mensaje")
    nullifier = data.get("nullifier")

    if not wallet or not firma or not mensaje or not nullifier:
        return jsonify({"success": False, "msg": "Datos incompletos"})

    # 🔐 VALIDAR FIRMA
    try:
        mensaje_codificado = encode_defunct(text=mensaje)
        direccion_recuperada = Account.recover_message(mensaje_codificado, signature=firma)

        if direccion_recuperada.lower() != wallet.lower():
            return jsonify({"success": False, "msg": "Firma inválida"})
    except:
        return jsonify({"success": False, "msg": "Error validando firma"})

    # 🚫 ANTI MULTICUENTA (WORLD ID)
    if usuarios.find_one({"nullifier": nullifier}):
        return jsonify({"success": False, "msg": "Usuario ya registrado"})

    # 💾 GUARDAR USUARIO
    usuarios.insert_one({
        "wallet": wallet,
        "nullifier": nullifier
    })

    return jsonify({"success": True})

# =========================
# HEALTH CHECK
# =========================
@app.route("/")
def home():
    return "CharlyCoin backend activo 🚀"

# =========================
# RUN
# =========================
if __name__ == "__main__":
    app.run()
