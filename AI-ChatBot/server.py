import sys
import os
import json
import traceback
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

PORT = int(os.environ.get("PORT", 8000))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Ensure local virtual environment packages are always discoverable
VENV_SITE_PACKAGES = os.path.join(DIRECTORY, '.venv', 'Lib', 'site-packages')
if os.path.exists(VENV_SITE_PACKAGES) and VENV_SITE_PACKAGES not in sys.path:
    sys.path.insert(0, VENV_SITE_PACKAGES)

# Secure local .env file loader
def load_dotenv():
    env_path = os.path.join(DIRECTORY, '.env')
    if os.path.exists(env_path):
        try:
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        k, v = k.strip(), v.strip().strip('"').strip("'")
                        if k and not os.environ.get(k):
                            os.environ[k] = v
        except Exception as e:
            print(f"[!] Warning reading .env: {e}")

load_dotenv()

# Import google-genai
try:
    # pyrefly: ignore [missing-import]
    from google import genai
    # pyrefly: ignore [missing-import]
    from google.genai import types
    GENAI_AVAILABLE = True
    GENAI_IMPORT_ERROR = ""
except Exception as e:
    genai = None  # type: ignore
    types = None  # type: ignore
    GENAI_AVAILABLE = False
    GENAI_IMPORT_ERROR = str(e)

MODEL_ALIASES = {
    "gemini-flash-latest": "gemini-flash-latest",
    "gemini-3.6-flash": "gemini-3.6-flash",
    "gemini-3.7-flash": "gemini-3.7-flash",
    "gemini-2.5-flash": "gemini-flash-latest",
    "gemini-2.0-flash": "gemini-flash-latest",
    "gemini-1.5-flash": "gemini-flash-latest"
}

def get_gemini_client(custom_api_key=None):
    """Initializes Google GenAI Client using API Key or Application Default Credentials (ADC)."""
    if not GENAI_AVAILABLE or genai is None:
        raise RuntimeError(f"google-genai is not available: {GENAI_IMPORT_ERROR}")

    api_key = custom_api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if api_key:
        return genai.Client(api_key=api_key)
    
    # Try vertex or ADC fallback
    project = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCP_PROJECT")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
    if project:
        return genai.Client(vertexai=True, project=project, location=location)
    
    # Default Client (ADC / Env)
    return genai.Client()

def build_system_instruction(persona, tone):
    personas = {
        "Software Architect": "You are Ameer AI, calibrated as a Principal Software Architect and elite Staff Engineer. You specialize in idiomatic code, distributed systems, clean architecture, performance optimization, and rigorous problem-solving. Prioritize production-ready code with concise, authoritative rationale.",
        "Research Analyst": "You are Ameer AI, calibrated as a Senior Quantitative Research Analyst. You specialize in rigorous data analysis, hypothesis testing, mathematical modeling, and structured empirical breakdowns.",
        "Creative Strategist": "You are Ameer AI, calibrated as an Executive Creative Director and Product Strategist. You specialize in compelling storytelling, product intuition, high-impact UX, and inventive brainstorming.",
        "Autonomous Executive": "You are Ameer AI, calibrated as an Autonomous Executive Co-Pilot. You specialize in high-leverage decision memos, synthesized roadmaps, prioritized action plans, and clear operational frameworks."
    }
    
    tones = {
        "Concise & Code-First": "Be extremely concise, direct, and code-first. Minimize fluff, greetings, and boilerplate. Get straight to the answer and implementation.",
        "Balanced & Clear": "Provide a well-balanced, clear, and structured response with helpful context and readable code examples.",
        "Deep Architectural Explanations": "Provide exhaustive, deep-dive architectural analysis. Explain trade-offs, edge cases, system bottlenecks, and theoretical underpinnings."
    }
    
    role_desc = personas.get(persona, personas["Software Architect"])
    tone_desc = tones.get(tone, tones["Balanced & Clear"])
    
    return f"{role_desc}\n\nStyle Directive: {tone_desc}\nFormat output in clean, readable Markdown with code syntax highlighting where applicable."

class ChatServerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        normalized_path = parsed.path.rstrip('/')
        if normalized_path == '/api/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            status = {
                "status": "online",
                "app_name": "Ameer AI ChatBot",
                "genai_sdk": GENAI_AVAILABLE,
                "project": os.environ.get("GOOGLE_CLOUD_PROJECT", "auto-detect (ADC)"),
                "has_api_key": bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")),
                "supported_models": ["gemini-flash-latest", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-2.5-flash"]
            }
            self.wfile.write(json.dumps(status).encode('utf-8'))
            return
        
        # Default static file serving
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        normalized_path = parsed.path.rstrip('/')
        if normalized_path == '/api/chat':
            self.handle_chat()
            return
        
        self.send_response(404)
        self.end_headers()

    def handle_chat(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 0:
            body = self.rfile.read(content_length).decode('utf-8')
        else:
            body = "{}"
        
        try:
            payload = json.loads(body)
        except Exception as e:
            self.send_error_json(400, f"Invalid JSON payload: {str(e)}")
            return

        if not isinstance(payload, dict):
            self.send_error_json(400, "JSON payload must be an object.")
            return

        message = str(payload.get('message') or '').strip()
        persona = str(payload.get('persona') or 'Software Architect').strip()
        tone = str(payload.get('tone') or 'Balanced & Clear').strip()
        requested_model = str(payload.get('model') or 'gemini-3.6-flash').strip()
        model_name = MODEL_ALIASES.get(requested_model, requested_model)
        
        raw_key = payload.get('apiKey')
        custom_key = str(raw_key).strip() if raw_key else None

        if not message:
            self.send_error_json(400, "Message is required.")
            return

        if not GENAI_AVAILABLE or genai is None or types is None:
            self.send_error_json(500, f"google-genai SDK not available: {GENAI_IMPORT_ERROR}")
            return

        system_instruction = build_system_instruction(persona, tone)

        try:
            client = get_gemini_client(custom_api_key=custom_key)
            
            # Use generate_content
            config = types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7
            )
            
            # Resilient candidate model fallback pool
            candidate_models = [model_name, "gemini-3.6-flash", "gemini-3.7-flash", "gemini-flash-latest"]
            models_to_try = []
            for m in candidate_models:
                if m and m not in models_to_try:
                    models_to_try.append(m)

            response = None
            last_err = None
            for m in models_to_try:
                try:
                    response = client.models.generate_content(
                        model=m,
                        contents=message,
                        config=config
                    )
                    model_name = m
                    break
                except Exception as model_err:
                    last_err = model_err
                    print(f"[*] Model {m} failed: {model_err}. Trying fallback...")
                    continue

            if response is None:
                if last_err is not None:
                    raise last_err
                raise RuntimeError("No candidate model produced a valid response.")

            reply_text = ""
            try:
                reply_text = response.text or ""
            except Exception:
                pass

            if not reply_text:
                try:
                    parts = response.candidates[0].content.parts
                    reply_text = "".join(getattr(p, 'text', '') for p in parts if getattr(p, 'text', None))
                except Exception:
                    pass

            if not reply_text:
                reply_text = "(Response was empty or filtered by safety guidelines)"

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            out = {
                "reply": reply_text,
                "model": model_name,
                "persona": persona,
                "tone": tone
            }
            self.wfile.write(json.dumps(out).encode('utf-8'))

        except Exception as err:
            err_msg = str(err)
            traceback.print_exc()
            hint = ""
            if any(k in err_msg for k in ["API_KEY_INVALID", "PERMISSION_DENIED", "DefaultCredentialsError", "No API key was provided", "API key not valid", "API_KEY"]):
                hint = "Tip: Make sure you have set GEMINI_API_KEY environment variable, run 'gcloud auth application-default login', or enter your Gemini API Key in the UI settings."
            
            full_msg = f"{err_msg}. {hint}".strip() if hint else err_msg
            self.send_error_json(500, full_msg)

    def send_error_json(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode('utf-8'))

def run(port=PORT):
    reconfig = getattr(sys.stdout, 'reconfigure', None)
    if callable(reconfig):
        reconfig(encoding='utf-8')
    HTTPServer.allow_reuse_address = True
    server_address = ('', port)
    httpd = HTTPServer(server_address, ChatServerHandler)
    print(f"[*] Ameer AI ChatBot Server running at http://localhost:{port}/")
    print(f"[*] Serving files from: {DIRECTORY}")
    httpd.serve_forever()

if __name__ == '__main__':
    run()
