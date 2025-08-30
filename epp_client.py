#!/usr/bin/env python3
import ssl
import socket
import sys
import textwrap
import struct

# ==== CONFIG ====
HOST = "ote.kenic.or.ke"
PORT = 700
USERNAME = "hack-a-milli"
PASSWORD = "TpEjG99Qq69t"
BUFFER_SIZE = 8192

# ==== HELPER: Build XML Commands ====
def epp_login():
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="no"?>
    <epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
      <command>
        <login>
          <clID>{USERNAME}</clID>
          <pw>{PASSWORD}</pw>
          <options>
            <version>1.0</version>
            <lang>en</lang>
          </options>
          <svcs>
            <objURI>urn:ietf:params:xml:ns:domain-1.0</objURI>
            <objURI>urn:ietf:params:xml:ns:contact-1.0</objURI>
            <objURI>urn:ietf:params:xml:ns:host-1.0</objURI>
          </svcs>
        </login>
        <clTRID>LOGIN-001</clTRID>
      </command>
    </epp>"""

def epp_logout():
    return """<?xml version="1.0" encoding="UTF-8" standalone="no"?>
    <epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
      <command>
        <logout/>
        <clTRID>LOGOUT-001</clTRID>
      </command>
    </epp>"""

def epp_check(domains):
    names = "\n".join([f"<domain:name>{d}</domain:name>" for d in domains])
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="no"?>
    <epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
      <command>
        <check>
          <domain:check xmlns:domain="urn:ietf:params:xml:ns:domain-1.0">
            {names}
          </domain:check>
        </check>
        <clTRID>CHECK-001</clTRID>
      </command>
    </epp>"""

def epp_create_contact(contact_id):
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="no"?>
    <epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
      <command>
        <create>
          <contact:create xmlns:contact="urn:ietf:params:xml:ns:contact-1.0">
            <contact:id>{contact_id}</contact:id>
            <contact:postalInfo type="int">
              <contact:name>Seth Makori</contact:name>
              <contact:org>Hackathon</contact:org>
              <contact:addr>
                <contact:street>123 Nairobi Rd</contact:street>
                <contact:city>Nairobi</contact:city>
                <contact:cc>KE</contact:cc>
              </contact:addr>
            </contact:postalInfo>
            <contact:voice>+254.759433906</contact:voice>
            <contact:email>makoriseth1237@gmail.com</contact:email>
            <contact:authInfo>
              <contact:pw>contactpw123</contact:pw>
            </contact:authInfo>
          </contact:create>
        </create>
        <clTRID>CONTACT-{contact_id}</clTRID>
      </command>
    </epp>"""

def epp_create_domain(domain, contact_id):
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="no"?>
    <epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
      <command>
        <create>
          <domain:create xmlns:domain="urn:ietf:params:xml:ns:domain-1.0">
            <domain:name>{domain}</domain:name>
            <domain:period unit="y">1</domain:period>
            <domain:ns>
              <domain:hostObj>ns1.google.com</domain:hostObj>
              <domain:hostObj>ns2.google.com</domain:hostObj>
            </domain:ns>
            <domain:registrant>{contact_id}</domain:registrant>
            <domain:contact type="admin">{contact_id}</domain:contact>
            <domain:contact type="tech">{contact_id}</domain:contact>
            <domain:authInfo>
              <domain:pw>domainpw123</domain:pw>
            </domain:authInfo>
          </domain:create>
        </create>
        <clTRID>CREATE-{domain}</clTRID>
      </command>
    </epp>"""

# ==== MAIN CLIENT CLASS ====
class EPPClient:
    def __init__(self, host, port):
        self.host = host
        self.port = port
        self.sock = None

    def connect(self):
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE

        raw_sock = socket.create_connection((self.host, self.port))
        self.sock = context.wrap_socket(raw_sock, server_hostname=self.host)

        # read greeting (framed)
        self._read_response("GREETING")

    def _read_response(self, label="RESPONSE"):
        # first 4 bytes = length
        header = self.sock.recv(4)
        if not header:
            raise Exception("No response from server")
        (length,) = struct.unpack("!I", header)
        body = b""
        while len(body) < length - 4:
            chunk = self.sock.recv(BUFFER_SIZE)
            if not chunk:
                break
            body += chunk
        xml_response = body.decode("utf-8", errors="ignore")
        print(f"\n=== {label} ===")
        print(textwrap.indent(xml_response, "  "))
        return xml_response

    def send(self, xml, label="RESPONSE"):
        if not self.sock:
            raise Exception("Not connected")
        data = xml.encode()
        msg = struct.pack("!I", len(data) + 4) + data
        self.sock.sendall(msg)
        return self._read_response(label)

    def close(self):
        if self.sock:
            self.sock.close()
            self.sock = None

# ==== CLI ====
def main():
    if len(sys.argv) < 2:
        print("Usage: python epp_client.py [login|check DOMAIN...|create_contact ID|create_domain DOMAIN CONTACT_ID|logout]")
        sys.exit(1)

    command = sys.argv[1]
    client = EPPClient(HOST, PORT)
    client.connect()

    if command == "login":
        client.send(epp_login(), "LOGIN")

    elif command == "check":
        domains = sys.argv[2:]
        if not domains:
            print("Usage: python epp_client.py check <domain1> [domain2 ...]")
            sys.exit(1)
        client.send(epp_login(), "LOGIN")
        client.send(epp_check(domains), "CHECK")
        client.send(epp_logout(), "LOGOUT")

    elif command == "create_contact":
        if len(sys.argv) < 3:
            print("Usage: python epp_client.py create_contact <contact_id>")
            sys.exit(1)
        contact_id = sys.argv[2]
        client.send(epp_login(), "LOGIN")
        client.send(epp_create_contact(contact_id), f"CREATE-CONTACT {contact_id}")
        client.send(epp_logout(), "LOGOUT")

    elif command == "create_domain":
        if len(sys.argv) < 4:
            print("Usage: python epp_client.py create_domain <domain> <contact_id>")
            sys.exit(1)
        domain = sys.argv[2]
        contact_id = sys.argv[3]
        client.send(epp_login(), "LOGIN")
        client.send(epp_create_domain(domain, contact_id), f"CREATE-DOMAIN {domain}")
        client.send(epp_logout(), "LOGOUT")

    elif command == "logout":
        client.send(epp_logout(), "LOGOUT")

    else:
        print("Unknown command:", command)

    client.close()

if __name__ == "__main__":
    main()
