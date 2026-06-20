# Honeypot real con Cowrie — datos genuinos para SecureDash

Esta guia es opcional pero es la mejora que mas valor agrega al proyecto:
en vez de logs simulados, capturas intentos de ataque REALES de internet
contra un servidor que tu controlas, y los procesas con el mismo
`detection_engine.py`.

## Que es un honeypot

Un honeypot es un sistema deliberadamente expuesto a internet que IMITA un
servicio real (SSH, telnet, HTTP) pero no tiene datos reales ni acceso a
nada importante. Su unico proposito es ser atacado, para que puedas estudiar
los ataques. Cowrie es uno de los honeypots SSH/Telnet mas usados y tiene
una comunidad enorme.

## Por que esto es relevante para el contexto chileno

Cualquier IP publica en internet recibe escaneos y intentos de fuerza bruta
constantemente, sin excepcion - no necesitas ser un objetivo "interesante".
En cuestion de horas vas a tener datos reales.

## Pasos (resumen)

1. **Levanta una VPS economica** (DigitalOcean, Linode, Vultr - desde ~USD
   5-6/mes, o usa el free tier de Oracle Cloud que incluye una VM gratis a
   largo plazo).

2. **Instala Cowrie**:
   ```bash
   sudo apt update && sudo apt install -y git python3-venv libssl-dev libffi-dev build-essential
   git clone https://github.com/cowrie/cowrie
   cd cowrie
   python3 -m venv cowrie-env
   source cowrie-env/bin/activate
   pip install --upgrade pip
   pip install -r requirements.txt
   cp etc/cowrie.cfg.dist etc/cowrie.cfg
   ```

3. **Configura el puerto**. Cowrie por defecto escucha en el puerto 2222
   (SSH simulado). Para que reciba el trafico de ataque "real" que llega al
   puerto 22, redirige con `iptables` (Cowrie NO debe correr como root
   directamente):
   ```bash
   sudo iptables -t nat -A PREROUTING -p tcp --dport 22 -j REDIRECT --to-port 2222
   ```

4. **Inicia Cowrie**:
   ```bash
   bin/cowrie start
   ```

5. **Espera**. En 1-24 horas vas a tener logs en
   `var/log/cowrie/cowrie.json` - cada linea es un evento JSON con
   `eventid`, `src_ip`, `username`, `password`, `timestamp`, etc.

## Adaptar detection_engine.py a logs de Cowrie

Los eventos de Cowrie usan otros nombres de campo. Un adaptador simple:

```python
# adapter_cowrie.py
import json

def cowrie_to_auth_event(line):
    e = json.loads(line)
    if e.get("eventid") not in ("cowrie.login.success", "cowrie.login.failed"):
        return None
    return {
        "timestamp": e["timestamp"],
        "source_ip": e["src_ip"],
        "username": e.get("username", "unknown"),
        "service": "ssh",
        "status": "success" if e["eventid"] == "cowrie.login.success" else "failed",
        "event": "auth",
    }
```

Con esto, los mismos `detect_brute_force()`, `detect_credential_stuffing()`,
etc. de `detection_engine.py` funcionan sin cambios sobre datos 100% reales.

## Importante: aislamiento y responsabilidad

- Nunca corras un honeypot en la misma red/VPS donde tengas datos o
  servicios reales.
- No interactues activamente con los atacantes ni intentes "contraatacar".
- Revisa los terminos de servicio de tu proveedor de VPS - la mayoria
  permite honeypots de baja interaccion como Cowrie, pero confirma antes.
- Los datos que captures (IPs, intentos de password) son de los atacantes,
  no de usuarios reales - no hay implicancias de privacidad de terceros
  relevantes, pero evita publicar el JSON crudo completo si contiene
  informacion que pudiera identificar tu infraestructura.
