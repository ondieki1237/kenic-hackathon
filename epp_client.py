#!/usr/bin/env python3
import sys, json, socket, ssl, struct, xml.etree.ElementTree as ET

HOST, PORT = "ote.kenic.or.ke", 700
USERNAME, PASSWORD = "hack-a-milli", "TpEjG99Qq69t"

def epp_login():
    return f"""<?xml version="1.0"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <command>
    <login>
      <clID>{USERNAME}</clID>
      <pw>{PASSWORD}</pw>
      <options><version>1.0</version><lang>en</lang></options>
      <svcs>
        <objURI>urn:ietf:params:xml:ns:domain-1.0</objURI>
      </svcs>
    </login>
    <clTRID>LOGIN-001</clTRID>
  </command>
</epp>"""

def epp_logout():
    return """<?xml version="1.0"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <command><logout/><clTRID>LOGOUT-001</clTRID></command>
</epp>"""

def epp_check(domain):
    return f"""<?xml version="1.0"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <command>
    <check>
      <domain:check xmlns:domain="urn:ietf:params:xml:ns:domain-1.0">
        <domain:name>{domain}</domain:name>
      </domain:check>
    </check>
    <clTRID>CHECK-001</clTRID>
  </command>
</epp>"""

def epp_create_domain(domain, contact):
    return f"""<?xml version="1.0"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <command>
    <create>
      <domain:create xmlns:domain="urn:ietf:params:xml:ns:domain-1.0">
        <domain:name>{domain}</domain:name>
        <domain:period unit="y">1</domain:period>
        <domain:registrant>{contact}</domain:registrant>
        <domain:contact type="admin">{contact}</domain:contact>
        <domain:contact type="tech">{contact}</domain:contact>
        <domain:authInfo><domain:pw>domainpw123</domain:pw></domain:authInfo>
      </domain:create>
    </create>
    <clTRID>CREATE-{domain}</clTRID>
  </command>
</epp>"""

def epp_delete_domain(domain):
    return f"""<?xml version="1.0"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <command>
    <delete>
      <domain:delete xmlns:domain="urn:ietf:params:xml:ns:domain-1.0">
        <domain:name>{domain}</domain:name>
      </domain:delete>
    </delete>
    <clTRID>DELETE-{domain}</clTRID>
  </command>
</epp>"""

class EPPClient:
    def __init__(self):
        self.sock = None
    def connect(self):
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        raw = socket.create_connection((HOST, PORT))
        self.sock = context.wrap_socket(raw, server_hostname=HOST)
        self._read_response()
    def _read_response(self):
        header = self.sock.recv(4)
        (length,) = struct.unpack("!I", header)
        data = b""
        while len(data) < length - 4:
            chunk = self.sock.recv(4096)
            if not chunk: break
            data += chunk
        return data.decode()
    def send(self, xml):
        data = xml.encode()
        self.sock.sendall(struct.pack("!I", len(data)+4)+data)
        return self._read_response()
    def close(self):
        if self.sock: self.sock.close(); self.sock=None

def parse_response(xml):
  try:
    root = ET.fromstring(xml)
    code = root.find(".//{urn:ietf:params:xml:ns:epp-1.0}result").attrib.get("code")
    msg = root.findtext(".//{urn:ietf:params:xml:ns:epp-1.0}msg")
    # For check command, extract <domain:cd><domain:name avail="1|0">...
    avail = None
    name_elem = root.find(".//{urn:ietf:params:xml:ns:domain-1.0}name")
    if name_elem is not None and "avail" in name_elem.attrib:
      avail = name_elem.attrib["avail"]
    if avail is not None:
      return {"code": code, "msg": msg, "data": {"available": avail}}
    return {"code": code, "msg": msg}
  except Exception as e:
    return {"code": None, "msg": "Parse error", "error": str(e)}

def main():
    if len(sys.argv)<3:
        print(json.dumps({"error":"Usage: check/create/delete <domain> [contact]"}))
        return
    cmd, domain = sys.argv[1], sys.argv[2]
    contact = sys.argv[3] if len(sys.argv)>3 else None
    client = EPPClient(); client.connect()
    client.send(epp_login())
    if cmd=="check": res=client.send(epp_check(domain))
    elif cmd=="create": res=client.send(epp_create_domain(domain, contact))
    elif cmd=="delete": res=client.send(epp_delete_domain(domain))
    else: print(json.dumps({"error":"Unknown command"})); client.close(); return
    print(json.dumps(parse_response(res)))
    client.send(epp_logout())
    client.close()

if __name__=="__main__": main()
