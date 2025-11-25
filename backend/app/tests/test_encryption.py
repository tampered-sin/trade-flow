from app.services.encryption import encrypt, decrypt

def test_encrypt_decrypt_roundtrip():
    s = "token-value"
    ct = encrypt(s)
    pt = decrypt(ct)
    assert pt == s