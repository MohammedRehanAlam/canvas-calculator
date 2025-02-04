import google.generativeai as genai
import json
from PIL import Image
from constants import GEMINI_API_KEY

genai.configure(api_key=GEMINI_API_KEY)

def clean_response_text(text: str) -> str:
    # Remove all markdown code blocks and formatting
    if '```' in text:
        # Split by ``` and take the content between them
        parts = text.split('```')
        if len(parts) >= 3:  # At least one complete code block
            text = parts[1]  # Take the content of first code block
            # Remove language identifier if present
            if '\n' in text:
                text = text.split('\n', 1)[1] if text.split('\n', 1)[0].lower() in ['json', 'python'] else text
    
    # Remove all whitespace and newlines
    text = ''.join(text.split())
    
    # Convert single quotes to double quotes for JSON compatibility
    text = text.replace("'", '"')
    
    return text.strip()

def analyze_image(img: Image, dict_of_vars: dict):
    model = genai.GenerativeModel(model_name="gemini-1.5-flash")
    dict_of_vars_str = json.dumps(dict_of_vars, ensure_ascii=False)
    prompt = (
        f"You are an advanced calculator and drawing analyzer that processes handwritten mathematical expressions, drawn shapes/diagrams, and identifies the purpose of colors used. "
        f"Given an image containing handwritten content and drawings: "
        f"1. First, identify the type of input and analyze any colors used: "
        f"   a) Mathematical expressions (equations, arithmetic) "
        f"   b) Geometric shapes (circles, rectangles, triangles) "
        f"   c) Diagrams or graphs "
        f"   d) Drawings or illustrations "
        f"2. For any colors used in the drawing: "
        f"   - Identify the purpose of each distinct color "
        f"   - Example: blue for sky, green for trees, yellow for sun, etc. "
        f"   - Include this in the 'color_usage' field of the response "
        f"3. For mathematical expressions: "
        f"   - Identify and analyze each separate expression "
        f"   - Consider expressions separate if on different lines or spatially distinct "
        f"   - Transcribe numbers, operators (+, -, x, ÷, ^), parentheses "
        f"   - Solve using PEMDAS rules "
        f"4. For geometric shapes: "
        f"   - Identify the shape type (circle, rectangle, triangle, etc.) "
        f"   - Calculate relevant measurements (area, perimeter, volume if 3D) "
        f"   - If dimensions are marked, use them in calculations "
        f"   - For unlabeled shapes, provide formulas with variables "
        f"5. For diagrams/graphs: "
        f"   - Identify the type (function graph, data plot, etc.) "
        f"   - Extract key points or relationships "
        f"   - Calculate slopes, intersections, or other relevant values "
        f"6. Return ALL results in this exact format: "
        f"   [{{"
        f"     'expr': 'input description', "
        f"     'result': 'calculated result', "
        f"     'type': 'math/shape/graph/drawing', "
        f"   }}] "
        f"Examples: "
        f"- Math: {{'expr': '2 + 3', 'result': '5', 'type': 'math'}} "
        f"- Shape: {{'expr': 'Circle(radius=5)', 'result': 'Area: 78.54, Circumference: 31.42', 'type': 'shape'}} "
        f"- Drawing: {{'expr': 'Landscape', 'result': 'Natural scene drawing', 'type': 'drawing'}} "
        f"- etc"
        f"Important: "
        f"- Return each item as a separate object in the array "
        f"- Maintain order as they appear (top to bottom, left to right) "
        f"- Include units for geometric calculations "
        f"- For variables, use these values: {dict_of_vars_str} "
        f"If handwriting is unclear, use mathematical context for interpretation. "
        f"Return response as a JSON array with single objects. DO NOT use markdown or pretty printing."
    )
    
    try:
        response = model.generate_content([prompt, img])
        print("Raw Gemini response:", response.text)
        
        # Clean and parse the response
        cleaned_text = clean_response_text(response.text)
        print("Cleaned response:", cleaned_text)  # Debug print
        
        try:
            answers = json.loads(cleaned_text)
            print("Successfully parsed JSON response")  # Debug print
        except json.JSONDecodeError as json_err:
            print(f"JSON parsing failed: {str(json_err)}")  # Debug print
            # If JSON parsing fails, try evaluating as Python literal
            try:
                import ast
                answers = ast.literal_eval(cleaned_text.replace('"', "'"))
                print("Successfully parsed with ast.literal_eval")  # Debug print
            except Exception as ast_err:
                print(f"AST parsing failed: {str(ast_err)}")  # Debug print
                # Try one last time with a more lenient approach
                try:
                    # Remove any remaining special characters and try again
                    text = cleaned_text.encode('ascii', 'ignore').decode()
                    text = ''.join(c for c in text if c.isprintable())
                    answers = json.loads(text)
                    print("Successfully parsed with lenient JSON")  # Debug print
                except Exception as final_err:
                    print(f"Final parsing attempt failed: {str(final_err)}")  # Debug print
                    raise ValueError(f"Failed to parse response: JSON error: {str(json_err)}")
        
        if not isinstance(answers, list):
            answers = [answers]
            
        # Ensure proper formatting and add type info
        formatted_answers = []
        for answer in answers:
            if not isinstance(answer, dict):
                continue
            if 'expr' not in answer or 'result' not in answer:
                continue
                
            formatted_answer = {
                'expr': str(answer.get('expr', '')),
                'result': str(answer.get('result', '')),
                'type': str(answer.get('type', 'math')),
                'assign': False
            }
            formatted_answers.append(formatted_answer)
            
        if formatted_answers:
            print("Returning formatted answers:", formatted_answers)  # Debug print
            return formatted_answers
            
        raise ValueError("No valid answers found in response")
        
    except Exception as e:
        print(f"Error processing image: {str(e)}")
        if "response" in locals() and hasattr(response, 'text') and response.text:
            try:
                # Extract any JSON-like structure from the response
                import re
                json_match = re.search(r'\{[^}]+\}', response.text)
                if json_match:
                    text = json_match.group(0)
                    text = text.replace("'", '"').replace('\n', '')
                    data = json.loads(text)
                    return [{
                        "expr": str(data.get('expr', 'Expression')),
                        "result": str(data.get('result', '')),
                        "type": str(data.get('type', 'math')),
                        "assign": False
                    }]
            except Exception as extract_err:
                print(f"Failed to extract result: {str(extract_err)}")
                
        return [{"expr": "Error processing expression", "result": "Invalid input", "type": "error", "assign": False}]