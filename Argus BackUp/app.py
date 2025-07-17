import re
from flask import Flask, Response, render_template, request, redirect, send_from_directory, url_for, session, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import os
import base64
import face_recognition
import numpy as np
import requests
import datetime
import random
import csv
import io
import pandas as pd
import smtplib
from email.message import EmailMessage
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
# Use a strong, unique secret key from environment variables
app.secret_key = os.getenv("SECRET_KEY") # DO NOT USE IN PRODUCTION

app.config['UPLOAD_FOLDER'] = 'static/uploads'

# MongoDB Configuration
mongo_client = MongoClient(os.getenv("MONGO_URI"))
mongo_db = mongo_client["face_recognition_data"]

# MongoDB Collections
users_collection = mongo_db["users"]
attendance_collection = mongo_db["attendance"]
admins_collection = mongo_db["admins"]
regularization_collection = mongo_db["attendance_regularization"] # Keep for clarity, though it's part of attendance_collection
password_reset_tokens = mongo_db["password_reset_tokens"]

# --- Constants for Configuration and Validation ---
MIN_PASSWORD_LENGTH = 8
MIN_EMPLOYEE_ID_LENGTH = 3
MIN_ADMIN_ID_LENGTH = 3
MIN_ADMIN_PASSWORD_LENGTH = 8
FACE_RECOGNITION_TOLERANCE = 0.5 # Lower means stricter face match
BEST_MATCH_SCORE_THRESHOLD = 0.6 # Minimum confidence for auto-signin

# --- Helper Functions ---

def admin_required(f):
    """Decorator to protect admin routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('admin_logged_in'):
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

def init_db():
    """Initializes the admin user if one does not already exist."""
    admin_username = os.getenv("ADMIN_USERNAME")
    admin_password = os.getenv("ADMIN_PASSWORD")

    if not admin_username or not admin_password:
        raise ValueError(
            "ADMIN_USERNAME and ADMIN_PASSWORD must be set in your .env file."
            " Without them, the admin user cannot be initialized securely."
        )

    # Check if admin user already exists to prevent re-creation and password overwrite
    if admins_collection.find_one({"username": admin_username}):
        print("Admin user already exists. Skipping initialization.")
    else:
        # Check if any admin exists. If not, create the default.
        # This is a safer approach than deleting all admins.
        if admins_collection.count_documents({}) == 0:
            admins_collection.insert_one({
                "username": admin_username,
                "password": generate_password_hash(admin_password)
            })
            print("Default admin user initialized successfully.")


def save_base64_image(data, filename):
    """Saves a base64 encoded image to the specified filename."""
    try:
        # Remove data URI prefix if present
        if 'base64,' in data:
            data = data.split('base64,')[1]
        img_data = base64.b64decode(data)

        filepath = os.path.join(app.config['UPLOAD_FOLDER'], 'faces', filename)
        os.makedirs(os.path.dirname(filepath), exist_ok=True) # Ensure directory exists

        with open(filepath, 'wb') as f:
            f.write(img_data)
        return filepath
    except Exception as e:
        app.logger.error(f"Error saving image {filename}: {e}")
        return None

def _validate_password_complexity(password):
    """
    Validates password against complexity rules:
    - Minimum length
    - At least one uppercase letter
    - At least one number
    - At least one special character
    """
    if len(password) < MIN_PASSWORD_LENGTH:
        return False, f"Password must be at least {MIN_PASSWORD_LENGTH} characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "Password must contain at least one special character."
    return True, "Password meets complexity requirements."

def _validate_email_format(email):
    """Validates basic email format."""
    return re.match(r'^[^@]+@[^@]+\.[^@]+$', email) is not None

def _process_and_encode_face(photo_data, emp_id):
    """
    Handles saving image, detecting and encoding face, and checking for duplicates.
    Returns face_encoding (list) and image_path (str) on success.
    Raises ValueError for errors like no face detected or duplicate face.
    """
    if not photo_data:
        raise ValueError("No photo data received.")

    filename = f"{emp_id}_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}.jpg"
    image_path = save_base64_image(photo_data, filename)

    if not image_path:
        raise ValueError("Failed to save image.")

    try:
        image = face_recognition.load_image_file(image_path)
        encodings = face_recognition.face_encodings(image)

        if not encodings:
            os.remove(image_path) # Clean up file if no face detected
            raise ValueError("No face detected in the captured photo. Please try again.")

        new_encoding = encodings[0]
        face_encoding = new_encoding.tolist()

        # Check for duplicate faces among existing users
        existing_users_with_faces = users_collection.find({"face_encoding": {"$ne": []}})
        for user in existing_users_with_faces:
            try:
                # Exclude the current user if updating an existing record
                if user.get('emp_id') == emp_id:
                    continue

                existing_encoding = np.array(user["face_encoding"])
                matches = face_recognition.compare_faces([existing_encoding], new_encoding, tolerance=FACE_RECOGNITION_TOLERANCE)

                if matches[0]: # If a match is found
                    os.remove(image_path) # Clean up the newly uploaded photo
                    raise ValueError(f"This face is already registered with employee ID: {user['emp_id']}")
            except Exception as e:
                app.logger.warning(f"Error during duplicate face check for user {user.get('emp_id', 'N/A')}: {e}")
                # Re-raise if it's a specific error preventing further processing for this face
                if isinstance(e, ValueError) and "This face is already registered" in str(e):
                    raise
                continue # Continue checking other users if it's a non-critical error

        return face_encoding, image_path

    except Exception as e:
        # Ensure cleanup if an error occurs during processing
        if os.path.exists(image_path):
            os.remove(image_path)
        raise e # Re-raise the exception after cleanup


def reverse_geocode(lat, lon):
    """Performs reverse geocoding to get a human-readable address."""
    try:
        if not lat or not lon:
            return "Location not recorded"

        url = "https://nominatim.openstreetmap.org/reverse"
        params = {
            'lat': lat,
            'lon': lon,
            'format': 'json',
            'zoom': 18,
            'addressdetails': 1
        }
        headers = {
            'User-Agent': 'FaceRecognitionAttendanceSystem/1.0 (contact@innovasolutions.com)', # More specific User-Agent
            'Accept-Language': 'en-US,en;q=0.9'
        }
        response = requests.get(url, params=params, headers=headers, timeout=5) # Add timeout
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

        data = response.json()
        address_parts = []
        address = data.get('address', {})

        # Prioritize more specific address components
        if 'house_number' in address: address_parts.append(address['house_number'])
        if 'road' in address: address_parts.append(address['road'])
        if 'suburb' in address: address_parts.append(address['suburb'])
        if 'city_district' in address: address_parts.append(address['city_district'])
        if 'city' in address: address_parts.append(address['city'])
        elif 'town' in address: address_parts.append(address['town'])
        elif 'village' in address: address_parts.append(address['village'])

        if 'state' in address: address_parts.append(address['state'])
        if 'postcode' in address: address_parts.append(address['postcode'])
        if 'country' in address: address_parts.append(address['country'])

        if not address_parts:
            return f"Location at {lat:.6f}, {lon:.6f}"

        return ', '.join(filter(None, address_parts))

    except requests.exceptions.Timeout:
        app.logger.error(f"Geocoding request timed out for {lat}, {lon}")
        return f"Location at {lat:.6f}, {lon:.6f} (Timeout)"
    except requests.exceptions.RequestException as e:
        app.logger.error(f"Geocoding request failed for {lat}, {lon}: {e}")
        return f"Location at {lat:.6f}, {lon:.6f} (Network Error)"
    except Exception as e:
        app.logger.error(f"Geocoding parsing error for {lat}, {lon}: {e}")
        return f"Location at {lat:.6f}, {lon:.6f} (Processing Error)"

def export_data(data, headers, filename, format_type='csv'):
    """Exports data to CSV or XLSX format."""
    if format_type == 'csv':
        si = io.StringIO()
        cw = csv.writer(si)
        cw.writerow(headers)
        cw.writerows(data)
        output = si.getvalue()
        mimetype = "text/csv"
        filename = f"{filename}.csv"
    elif format_type in ['xlsx', 'excel']:
        output = io.BytesIO()
        df = pd.DataFrame(data, columns=headers)
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df.to_excel(writer, index=False, sheet_name='Sheet1')
            worksheet = writer.sheets['Sheet1']

            # Auto-adjust column width
            for idx, col in enumerate(df.columns):
                max_len = 0
                if df[col].astype(str).any(): # Check if Series is not empty
                    max_len = max(df[col].astype(str).map(len).max(), len(col)) + 2
                else: # Handle case of empty column
                    max_len = len(col) + 2
                worksheet.set_column(idx, idx, max_len)
        output.seek(0)
        mimetype = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"{filename}.xlsx"
    else:
        raise ValueError("Invalid export format specified. Must be 'csv' or 'xlsx'.")

    return Response(
        output,
        mimetype=mimetype,
        headers={"Content-disposition": f"attachment; filename={filename}"}
    )

# --- Routes ---

@app.route('/')
def home():
    """Renders the main home/kiosk page for punch-in/punch-out."""
    return render_template('home.html')

@app.route('/admin')
def admin_login():
    """Renders the admin login page."""
    return render_template('admin.html')

@app.route('/service-worker.js')
def service_worker():
    """Serves the service worker file."""
    return send_from_directory('static/js', 'service-worker.js', mimetype='application/javascript')

@app.route('/manifest.json')
def manifest():
    """Serves the PWA manifest file."""
    return send_from_directory('static', 'manifest.json', mimetype='application/manifest+json')

@app.route('/admin/auth', methods=['POST'])
def admin_authenticate():
    """Authenticates admin users."""
    username = request.form.get('adminid')
    password = request.form.get('adminpass')

    if not username or len(username) < MIN_ADMIN_ID_LENGTH:
        return render_template('admin.html', error=f'Admin ID must be at least {MIN_ADMIN_ID_LENGTH} characters.')
    if not password or len(password) < MIN_ADMIN_PASSWORD_LENGTH: # Basic length check
        return render_template('admin.html', error=f'Password must be at least {MIN_ADMIN_PASSWORD_LENGTH} characters.')

    try:
        admin = admins_collection.find_one({'username': username})
        if admin and check_password_hash(admin['password'], password):
            session['admin_logged_in'] = True
            session['admin_username'] = username
            return redirect(url_for('admin_dashboard'))
        return render_template('admin.html', error='Invalid credentials.')
    except Exception as e:
        app.logger.error(f"Admin authentication error: {e}")
        return render_template('admin.html', error='An internal authentication error occurred. Please try again.')

@app.route('/employee_login')
def employee_login():
    """Renders the employee login page."""
    return render_template('employee_login.html')

@app.route('/static/uploads/faces/<filename>')
def uploaded_file(filename):
    """Serves uploaded face images (should be secured in production)."""
    # In a production environment, this endpoint should be secured with proper
    # authentication and authorization checks, or images should be served via
    # pre-signed URLs from object storage.
    return send_from_directory(os.path.join(app.config['UPLOAD_FOLDER'], 'faces'), filename)

@app.route('/admin/logout')
def admin_logout():
    """Logs out the admin user."""
    session.pop('admin_logged_in', None)
    session.pop('admin_username', None)
    return redirect(url_for('admin_login'))

@app.route('/employee_signup', methods=['GET', 'POST'])
def employee_signup():
    """Handles employee registration, including face capture."""
    if request.method == 'POST':
        try:
            data = request.get_json()
            if not data:
                return jsonify({"success": False, "message": "Invalid request data."}), 400

            # Server-side validation for all required fields
            full_name = data.get('fullName')
            emp_id = data.get('empId')
            email = data.get('email')
            personal_email = data.get('personalEmail')
            password = data.get('password')
            photo_data = data.get('capturedImage')

            if not all([full_name, emp_id, email, password, photo_data]):
                return jsonify({"success": False, "message": "All required fields (Full Name, Employee ID, Company Email, Password, Photo) must be provided."}), 400

            if len(emp_id) < MIN_EMPLOYEE_ID_LENGTH:
                return jsonify({"success": False, "message": f"Employee ID must be at least {MIN_EMPLOYEE_ID_LENGTH} characters long."}), 400

            if not _validate_email_format(email):
                return jsonify({"success": False, "message": "Invalid company email format."}), 400
            if not email.endswith('@innovasolutions.com'):
                return jsonify({"success": False, "message": "Please use your @innovasolutions.com email address."}), 400

            if personal_email and not _validate_email_format(personal_email):
                return jsonify({"success": False, "message": "Invalid personal email format."}), 400

            is_strong, password_message = _validate_password_complexity(password)
            if not is_strong:
                return jsonify({"success": False, "message": password_message}), 400

            # Check for existing employee ID or email
            if users_collection.find_one({'emp_id': emp_id}):
                return jsonify({"success": False, "message": "Employee ID already exists. Please choose a different one."}), 400
            if users_collection.find_one({'email': email}):
                return jsonify({"success": False, "message": "Company email already exists. Please use a different one."}), 400

            # Process and encode face
            try:
                face_encoding, image_path = _process_and_encode_face(photo_data, emp_id)
            except ValueError as ve:
                return jsonify({"success": False, "message": str(ve)}), 400
            except Exception as e:
                app.logger.error(f"Face processing error during signup: {e}")
                return jsonify({"success": False, "message": "Failed to process face photo."}), 500

            # Hash password and insert user
            hashed_password = generate_password_hash(password)
            users_collection.insert_one({
                "emp_id": emp_id,
                "full_name": full_name,
                "email": email,
                "personal_email": personal_email or "",
                "image_path": image_path,
                "face_encoding": face_encoding,
                "password": hashed_password,
                "department": "Not assigned", # Default values
                "position": "Not assigned"    # Default values
            })

            return jsonify({"success": True, "message": "Registration successful. You can now log in."}), 200

        except Exception as e:
            app.logger.error(f"Error in employee_signup route: {e}", exc_info=True)
            return jsonify({"success": False, "message": f"An unexpected error occurred during registration. Please try again later."}), 500

    return render_template('employee_signup.html')


@app.route('/employee')
def employee():
    """Renders the employee dashboard."""
    if 'user' not in session:
        return redirect(url_for('employee_login'))

    emp_id = session['user']['emp_id']
    username = session['user']['username']

    try:
        today = datetime.date.today().isoformat()

        # Get today's attendance records
        records = list(attendance_collection.find({
            "emp_id": emp_id,
            "date": today,
            "status": {"$ne": "Historical"} # Exclude historical records
        }).sort("punch_in", 1))

        user_data = users_collection.find_one({"emp_id": emp_id})

        attendance_records_today = []
        for record in records:
            punch_in = record.get('punch_in')
            punch_out = record.get('punch_out')
            status = record.get('status')

            # Format times for display
            if punch_in:
                punch_in = datetime.datetime.fromisoformat(punch_in).strftime('%H:%M:%S')
            if punch_out:
                punch_out = datetime.datetime.fromisoformat(punch_out).strftime('%H:%M:%S')

            attendance_records_today.append({
                'punch_in': punch_in or '-',
                'punch_out': punch_out or '-',
                'status': status if status else ('Active' if punch_in and not punch_out else 'Completed')
            })

        current_status = "Punched In" if any(r['punch_in'] != '-' and r['punch_out'] == '-' for r in attendance_records_today) else "Punched Out"

        image_path = None
        if user_data and user_data.get('image_path'):
            # Ensure the image path is correct for rendering in HTML
            # Convert the local file path to a URL using url_for
            if user_data['image_path'].startswith(app.config['UPLOAD_FOLDER']):
                image_path = url_for('uploaded_file', filename=os.path.basename(user_data['image_path']))
            else:
                image_path = user_data['image_path'] # Assume it's already a URL or placeholder

        return render_template('employee.html',
                               username=username,
                               status=current_status,
                               attendance_records=attendance_records_today,
                               emp_id=emp_id,
                               user={
                                   'emp_id': user_data['emp_id'],
                                   'image_path': image_path,
                                   'email': user_data.get('email', ''),
                                   'personal_email': user_data.get('personal_email', ''),
                                   'department': user_data.get('department', 'Not assigned'),
                                   'position': user_data.get('position', 'Not assigned')
                               })
    except Exception as e:
        app.logger.error(f"Error loading employee dashboard for {emp_id}: {str(e)}", exc_info=True)
        return render_template('employee.html',
                               error=f'Failed to load dashboard data: {str(e)}',
                               username=session.get('user', {}).get('username', 'Employee'),
                               status='Error',
                               attendance_records=[],
                               emp_id=session.get('user', {}).get('emp_id', 'N/A'),
                               user={'emp_id': 'N/A', 'image_path': None, 'personal_email': '', 'department': 'N/A', 'position': 'N/A'}
                               )

@app.route('/auto_signin', methods=['POST'])
def auto_signin():
    """Handles automatic punch-in/punch-out via face recognition."""
    temp_path = None
    try:
        photo_data = request.json.get('capturedPhoto')
        action = request.json.get('action', 'punchin')
        latitude = request.json.get('latitude')
        longitude = request.json.get('longitude')

        if not photo_data:
            return jsonify({'success': False, 'message': 'No image received for recognition.'}), 400

        temp_filename = f"temp_recognition_{datetime.datetime.now().strftime('%Y%m%d%H%M%S%f')}.jpg"
        temp_path = save_base64_image(photo_data, temp_filename)

        if not temp_path:
            return jsonify({'success': False, 'message': 'Failed to save temporary image.'}), 500

        temp_image = face_recognition.load_image_file(temp_path)
        temp_encodings = face_recognition.face_encodings(temp_image)

        if not temp_encodings:
            os.remove(temp_path)
            return jsonify({'success': False, 'message': 'No face detected in the captured photo.'}), 400

        temp_encoding = temp_encodings[0]
        matched_user = None
        best_match_score = 0.0 # Initialize with lowest possible score

        users = list(users_collection.find({"face_encoding": {"$ne": []}})) # Only query users with stored encodings

        for user in users:
            try:
                stored_encoding = np.array(user["face_encoding"])
                face_distance = face_recognition.face_distance([stored_encoding], temp_encoding)[0]
                match_score = 1 - face_distance # Convert distance to a confidence score (0 to 1)

                if match_score > best_match_score and match_score >= BEST_MATCH_SCORE_THRESHOLD:
                    best_match_score = match_score
                    matched_user = {
                        'emp_id': user['emp_id'],
                        'full_name': user['full_name'],
                        'image_path': user['image_path'],
                        'match_score': match_score
                    }
            except Exception as e:
                app.logger.error(f"Error processing face encoding for user {user.get('emp_id', 'N/A')}: {e}")
                continue # Continue to next user on error

        # Clean up temporary image immediately after processing
        if os.path.exists(temp_path):
            os.remove(temp_path)

        if not matched_user:
            # If no user matched with sufficient confidence
            return jsonify({'success': False, 'message': 'User not recognized. Please try again.', 'confidence': round(best_match_score, 2)}), 404

        # If a match is found, proceed with attendance logic
        emp_id = matched_user['emp_id']
        today_iso = datetime.date.today().isoformat()
        now_iso = datetime.datetime.now().isoformat()

        # Resolve location address
        address = reverse_geocode(latitude, longitude) if latitude and longitude else 'Location not recorded'

        # Find any active punch-in for today for this employee
        active_record = attendance_collection.find_one(
            {"emp_id": emp_id, "date": today_iso, "punch_out": None, "status": {"$ne": "Historical"}},
            sort=[("punch_in", -1)]
        )

        status_message = ""
        if action == 'punchin':
            if active_record:
                return jsonify({'success': False, 'message': 'You are already punched in. Please punch out first.', 'confidence': round(best_match_score, 2)}), 400

            attendance_collection.insert_one({
                "emp_id": emp_id,
                "date": today_iso,
                "punch_in": now_iso,
                "punch_out": None,
                "latitude": latitude,
                "longitude": longitude,
                "address": address,
                "punch_out_latitude": None,
                "punch_out_longitude": None,
                "punch_out_address": None,
                "status": "Present" # Initial status for punch-in
            })
            status_message = "Punched In Successfully"
        elif action == 'punchout':
            if not active_record:
                return jsonify({'success': False, 'message': 'No active punch in found for today. Please punch in first.', 'confidence': round(best_match_score, 2)}), 400

            # Update the active record with punch-out details
            attendance_collection.update_one(
                {"_id": active_record["_id"]},
                {"$set": {
                    "punch_out": now_iso,
                    "punch_out_latitude": latitude,
                    "punch_out_longitude": longitude,
                    "punch_out_address": address,
                    "status": "Completed" # Mark as completed after punch-out
                }}
            )
            status_message = "Punched Out Successfully"
        else:
            return jsonify({'success': False, 'message': 'Invalid action specified.', 'confidence': round(best_match_score, 2)}), 400

        # Construct the URL for the user's image from its stored path
        user_image_url = url_for('uploaded_file', filename=os.path.basename(matched_user['image_path']))

        return jsonify({
            'success': True,
            'full_name': matched_user['full_name'],
            'emp_id': emp_id,
            'status': status_message,
            'image_path': user_image_url, # Ensure this is a URL for the frontend
            'confidence': round(best_match_score, 2),
            'action': action,
            'location': address,
            'timestamp': now_iso
        }), 200

    except Exception as e:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path) # Ensure temp file is cleaned up even on unexpected errors
        app.logger.error(f"Auto sign-in error: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': f"An internal server error occurred during recognition: {str(e)}", 'confidence': 0.0}), 500


@app.route('/employee_login_auth', methods=['POST'])
def employee_login_auth():
    """Authenticates employee users via ID and password."""
    try:
        data = request.get_json()
        emp_id = data.get('empId')
        password = data.get('password')

        if not emp_id or not password:
            return jsonify({'success': False, 'message': 'Employee ID and password are required.'}), 400

        if len(emp_id) < MIN_EMPLOYEE_ID_LENGTH:
            return jsonify({'success': False, 'message': f'Employee ID must be at least {MIN_EMPLOYEE_ID_LENGTH} characters long.'}), 400

        user = users_collection.find_one({"emp_id": emp_id})

        if not user:
            return jsonify({'success': False, 'message': 'Invalid Employee ID or password.'}), 401 # Use 401 for auth failure

        stored_password_hash = user.get('password')
        if not stored_password_hash or not check_password_hash(stored_password_hash, password):
            return jsonify({'success': False, 'message': 'Invalid Employee ID or password.'}), 401

        # Successful login, set session
        session['user'] = {
            'username': user.get('full_name', 'Employee'),
            'emp_id': user.get('emp_id'),
            'status': 'Logged In', # This status is for session, not attendance
            'image_path': user.get('image_path'),
            'email': user.get('email', ''), # Store company email
            'personal_email': user.get('personal_email', ''), # Store personal email
            'department': user.get('department', 'Not assigned'),
            'position': user.get('position', 'Not assigned')
        }
        return jsonify({'success': True, 'message': 'Login successful. Redirecting...'}), 200

    except Exception as e:
        app.logger.error(f"Employee login error: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': 'An unexpected error occurred during login. Please try again.'}), 500

@app.route('/attendance')
def attendance():
    """Renders the employee attendance history page."""
    if 'user' not in session:
        return redirect(url_for('home'))

    emp_id = session['user']['emp_id']

    try:
        # Fetch all attendance records for the employee, sorted by date and then punch_in
        raw_records = list(attendance_collection.find({"emp_id": emp_id}).sort([("date", -1), ("punch_in", 1)]))

        attendance_data_map = {} # Use a map to group by date and easily override with regularized data

        for record in raw_records:
            date_key = record['date'] # ISO format date

            # Initialize entry for this date if not present
            if date_key not in attendance_data_map:
                attendance_data_map[date_key] = {
                    'date': datetime.datetime.fromisoformat(date_key).strftime('%d %b %Y'),
                    'shift_in': '09:00', # Default shift times
                    'shift_out': '17:00', # Default shift times
                    'actual_in': '-',
                    'actual_out': '-',
                    'work_hours': '-',
                    'status': 'Absent', # Default status
                    'address': 'Location not recorded', # Initial location
                    'first_punch_in_raw': None,
                    'last_punch_out_raw': None,
                    'is_regularized': False
                }

            current_day_data = attendance_data_map[date_key]

            # If the record is 'Regularized', it takes precedence for actual times and status
            if record.get('status') == 'Regularized':
                current_day_data['actual_in'] = datetime.datetime.fromisoformat(record['punch_in']).strftime('%H:%M') if record.get('punch_in') else '-'
                current_day_data['actual_out'] = datetime.datetime.fromisoformat(record['punch_out']).strftime('%H:%M') if record.get('punch_out') else '-'
                current_day_data['status'] = 'Regularized'
                current_day_data['is_regularized'] = True
                current_day_data['first_punch_in_raw'] = record.get('punch_in') # Store raw for work hours calc
                current_day_data['last_punch_out_raw'] = record.get('punch_out') # Store raw for work hours calc
                current_day_data['address'] = record.get('address') or current_day_data['address'] # Use address from regularized record

            # If not regularized and not a historical marker, process for min punch-in and max punch-out
            elif not current_day_data['is_regularized'] and record.get('status') != 'Historical':
                if record.get('punch_in'):
                    if current_day_data['first_punch_in_raw'] is None or record['punch_in'] < current_day_data['first_punch_in_raw']:
                        current_day_data['first_punch_in_raw'] = record['punch_in']
                        current_day_data['actual_in'] = datetime.datetime.fromisoformat(record['punch_in']).strftime('%H:%M')

                if record.get('punch_out'):
                    if current_day_data['last_punch_out_raw'] is None or record['punch_out'] > current_day_data['last_punch_out_raw']:
                        current_day_data['last_punch_out_raw'] = record['punch_out']
                        current_day_data['actual_out'] = datetime.datetime.fromisoformat(record['punch_out']).strftime('%H:%M')

                # Determine status based on actual punches if not regularized
                if current_day_data['first_punch_in_raw'] and current_day_data['last_punch_out_raw']:
                    current_day_data['status'] = 'Present'
                elif current_day_data['first_punch_in_raw']:
                    current_day_data['status'] = 'Active'

                # Update address from the latest record if no specific address from regularized entry
                if record.get('address') and record['address'] != 'Location not recorded':
                    current_day_data['address'] = record['address']
                elif record.get('latitude') and record.get('longitude') and (record['latitude'] is not None and record['longitude'] is not None):
                    try:
                        geo_address = reverse_geocode(record['latitude'], record['longitude'])
                        if geo_address and geo_address != 'Location not recorded':
                            current_day_data['address'] = geo_address
                    except Exception:
                        pass # Ignore geocoding errors for display purpose

        # Calculate work hours and finalize status for display
        final_attendance_records = []
        for date_key in sorted(attendance_data_map.keys(), reverse=True): # Sort by date descending
            data = attendance_data_map[date_key]

            work_hours = '-'
            if data['first_punch_in_raw'] and data['last_punch_out_raw']:
                try:
                    delta = datetime.datetime.fromisoformat(data['last_punch_out_raw']) - datetime.datetime.fromisoformat(data['first_punch_in_raw'])
                    hours, remainder = divmod(int(delta.total_seconds()), 3600)
                    minutes = (remainder // 60)
                    work_hours = f"{hours:02d}:{minutes:02d}"
                except Exception as e:
                    app.logger.warning(f"Error calculating work hours for {date_key}: {e}")
                    work_hours = '-'
            data['work_hours'] = work_hours

            # Check for late status if present and not regularized
            if data['status'] == 'Present' and data['actual_in'] != '-' and not data['is_regularized']:
                try:
                    actual_in_time = datetime.datetime.strptime(data['actual_in'], '%H:%M').time()
                    shift_in_time = datetime.datetime.strptime(data['shift_in'], '%H:%M').time()
                    if actual_in_time > shift_in_time:
                        data['status'] = 'Late'
                except ValueError:
                    pass # Ignore if time format is unexpected

            # Remove temporary raw fields before passing to template
            del data['first_punch_in_raw']
            del data['last_punch_out_raw']
            del data['is_regularized']

            final_attendance_records.append(data)

        return render_template('attendance.html',
                               attendance_records=final_attendance_records,
                               user=session['user'])
    except Exception as e:
        app.logger.error(f"Error loading attendance records for {emp_id}: {str(e)}", exc_info=True)
        return render_template('attendance.html',
                               error=f'Failed to load attendance history: {str(e)}',
                               user=session['user'],
                               attendance_records=[])

@app.route('/regularize_attendance', methods=['POST'])
def regularize_attendance():
    """Handles employee requests to regularize attendance records."""
    if 'user' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated.'}), 401

    try:
        data = request.get_json()
        if not data or 'records' not in data:
            return jsonify({'success': False, "message": 'Invalid request data format. "records" key is missing.'}), 400

        emp_id = session['user']['emp_id']
        updated_records_for_response = []

        for record_data in data['records']:
            date_display_str = record_data.get('date')
            modified_in_time_str = record_data.get('modified_in')
            modified_out_time_str = record_data.get('modified_out')
            reason = record_data.get('reason', '').strip()
            comments = record_data.get('comments', '').strip()

            if not date_display_str:
                return jsonify({'success': False, 'message': 'Date is required for regularization.'}), 400
            if not reason:
                return jsonify({'success': False, 'message': 'Reason is required for all regularization requests.'}), 400

            try:
                date_obj = datetime.datetime.strptime(date_display_str, '%d %b %Y')
                iso_date = date_obj.date().isoformat()
            except ValueError:
                return jsonify({'success': False, 'message': f'Invalid date format for {date_display_str}. Expected "DD Mon YYYY".'}), 400

            # Construct full ISO timestamps for modified times if provided
            modified_in_iso = f"{iso_date}T{modified_in_time_str}:00" if modified_in_time_str else None
            modified_out_iso = f"{iso_date}T{modified_out_time_str}:00" if modified_out_time_str else None

            # Fetch existing records for this employee on this date to mark as 'Historical'
            # Find all non-historical records for this date and employee
            existing_records = list(attendance_collection.find(
                {"emp_id": emp_id, "date": iso_date, "status": {"$ne": "Historical"}}
            ).sort("punch_in", 1)) # Sort to get the earliest punch-in as 'original'

            original_punch_in = None
            original_punch_out = None
            original_latitude = None
            original_longitude = None
            original_address = None

            if existing_records:
                # For historical tracking, take the earliest punch-in and latest punch-out from existing records
                original_punch_in = min([r.get('punch_in') for r in existing_records if r.get('punch_in')], default=None)
                original_punch_out = max([r.get('punch_out') for r in existing_records if r.get('punch_out')], default=None)

                # Get original location from the record that had the first punch_in
                for rec in existing_records:
                    if rec.get('punch_in') == original_punch_in:
                        original_latitude = rec.get('latitude')
                        original_longitude = rec.get('longitude')
                        original_address = rec.get('address')
                        break

                # Mark all relevant existing records as 'Historical'
                attendance_collection.update_many(
                    {"emp_id": emp_id, "date": iso_date, "status": {"$ne": "Historical"}},
                    {"$set": {"status": "Historical"}}
                )

            # Insert the new regularized record
            inserted_id = attendance_collection.insert_one({
                "emp_id": emp_id,
                "date": iso_date,
                "punch_in": modified_in_iso or original_punch_in, # Use modified or original if not provided
                "punch_out": modified_out_iso or original_punch_out, # Use modified or original if not provided
                "latitude": original_latitude, # Retain original lat/lon if not modified
                "longitude": original_longitude,
                "address": original_address, # Retain original address
                "status": "Regularized",
                "regularized_reason": reason,
                "regularized_comments": comments,
                "regularized_by": session['user']['username'], # Record who regularized it
                "regularized_at": datetime.datetime.now().isoformat()
            }).inserted_id

            inserted_record = attendance_collection.find_one({"_id": inserted_id})

            if inserted_record:
                # Prepare data for frontend response
                updated_records_for_response.append({
                    'date': datetime.datetime.fromisoformat(inserted_record['date']).strftime('%d %b %Y'),
                    'actual_in': datetime.datetime.fromisoformat(inserted_record['punch_in']).strftime('%H:%M') if inserted_record.get('punch_in') else '-',
                    'actual_out': datetime.datetime.fromisoformat(inserted_record['punch_out']).strftime('%H:%M') if inserted_record.get('punch_out') else '-',
                    'status': inserted_record.get('status', 'Regularized'),
                    'modified_in': datetime.datetime.fromisoformat(inserted_record['punch_in']).strftime('%H:%M') if inserted_record.get('punch_in') else '-',
                    'modified_out': datetime.datetime.fromisoformat(inserted_record['punch_out']).strftime('%H:%M') if inserted_record.get('punch_out') else '-'
                })

        if not updated_records_for_response:
             return jsonify({'success': False, 'message': 'No valid records were submitted for regularization or no changes were detected.'}), 400

        return jsonify({
            'success': True,
            'message': 'Attendance regularized successfully!',
            'updated_records': updated_records_for_response
        }), 200

    except Exception as e:
        app.logger.error(f"Error regularizing attendance for employee {emp_id}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': f'An unexpected error occurred during regularization: {str(e)}'}), 500

@app.route('/admin/dashboard')
@admin_required
def admin_dashboard():
    """Renders the admin dashboard with attendance statistics and records."""
    try:
        total_employees = users_collection.count_documents({})
        today_iso = datetime.date.today().isoformat()

        # Present Today: Count unique employees with any punch_in today that are not historical
        present_count_pipeline = [
            {"$match": {"date": today_iso, "punch_in": {"$ne": None}, "status": {"$ne": "Historical"}}},
            {"$group": {"_id": "$emp_id"}}
        ]
        present_count = len(list(attendance_collection.aggregate(present_count_pipeline)))

        # Late Today: Count unique employees whose first punch_in today is after 9 AM (example shift start)
        late_count = 0
        today_punch_ins_for_late = attendance_collection.aggregate([
            {"$match": {"date": today_iso, "punch_in": {"$ne": None}, "status": {"$ne": "Historical"}}},
            {"$group": {
                "_id": "$emp_id",
                "first_punch_in": {"$min": "$punch_in"}
            }}
        ])

        for entry in today_punch_ins_for_late:
            try:
                first_punch_time = datetime.datetime.fromisoformat(entry['first_punch_in']).time()
                # Assuming standard shift starts at 9 AM for 'late' calculation
                if first_punch_time > datetime.time(9, 0, 0):
                    late_count += 1
            except Exception as e:
                app.logger.warning(f"Error parsing punch_in time for late count calculation (admin dashboard): {e}")
                continue

        pending_requests = attendance_collection.count_documents({"status": "Regularized"})

        # Filtering and Pagination for Attendance Records Table
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        emp_id_filter = request.args.get('emp_id', '').strip()
        status_filter = request.args.get('status', '').strip()
        sort = request.args.get('sort', 'date_desc')
        page = int(request.args.get('page', 1))
        per_page = 10

        query_filters = {"status": {"$ne": "Historical"}} # Default: exclude historical records

        if start_date:
            query_filters["date"] = {"$gte": start_date}
        if end_date:
            query_filters.setdefault("date", {}).update({"$lte": end_date})

        if emp_id_filter:
            # Search by exact emp_id or full_name (case-insensitive)
            user_ids_from_name_search = list(users_collection.find(
                {"full_name": {'$regex': emp_id_filter, '$options': 'i'}},
                {"emp_id": 1}
            ))
            matched_emp_ids = [u['emp_id'] for u in user_ids_from_name_search]

            if matched_emp_ids:
                query_filters["emp_id"] = {"$in": matched_emp_ids}
            else:
                # If no name match, assume it's an exact emp_id search
                query_filters["emp_id"] = emp_id_filter

        if status_filter:
            query_filters["status"] = status_filter

        total_records_filtered = attendance_collection.count_documents(query_filters)
        total_pages = (total_records_filtered + per_page - 1) // per_page
        skip = (page - 1) * per_page

        sort_map = {
            "intime_asc": ("punch_in", 1),
            "intime_desc": ("punch_in", -1),
            "outtime_asc": ("punch_out", 1),
            "outtime_desc": ("punch_out", -1),
            "date_asc": ("date", 1),
            "date_desc": ("date", -1)
        }
        sort_field, sort_order = sort_map.get(sort, ("date", -1))

        # Aggregate to join with user info and format data
        pipeline = [
            {"$match": query_filters},
            {"$sort": {sort_field: sort_order}},
            {"$skip": skip},
            {"$limit": per_page},
            {
                "$lookup": {
                    "from": "users",
                    "localField": "emp_id",
                    "foreignField": "emp_id",
                    "as": "user_info"
                }
            },
            {"$unwind": {"path": "$user_info", "preserveNullAndEmptyArrays": True}},
            {
                "$project": {
                    "emp_id": 1,
                    "date": 1,
                    "punch_in": 1,
                    "punch_out": 1,
                    "punch_in_address": "$address",
                    "punch_out_address": "$punch_out_address",
                    "status": 1,
                    "full_name": {"$ifNull": ["$user_info.full_name", "Unknown"]}
                }
            }
        ]

        attendance_records_display = list(attendance_collection.aggregate(pipeline))

        # Format times and dates for display
        for record in attendance_records_display:
            record['date'] = datetime.datetime.fromisoformat(record['date']).strftime('%Y-%m-%d') if record.get('date') else '-'
            record['punch_in'] = datetime.datetime.fromisoformat(record['punch_in']).strftime('%H:%M:%S') if record.get('punch_in') else '-'
            record['punch_out'] = datetime.datetime.fromisoformat(record['punch_out']).strftime('%H:%M:%S') if record.get('punch_out') else '-'
            record['punch_in_address'] = record.get('punch_in_address') or '-'
            record['punch_out_address'] = record.get('punch_out_address') or '-'

        # Get all distinct statuses for the filter dropdown, excluding 'Historical'
        status_options = sorted(list(attendance_collection.distinct("status", {"status": {"$ne": None, "$ne": "Historical"}})))

        return render_template('admin_dashboard.html',
                               attendance_records=attendance_records_display,
                               start_date=start_date,
                               end_date=end_date,
                               emp_id=emp_id_filter,
                               status_filter=status_filter,
                               status_options=status_options,
                               sort=sort,
                               total_employees=total_employees,
                               present_count=present_count,
                               late_count=late_count,
                               pending_requests=pending_requests,
                               total_records=total_records_filtered,
                               total_pages=total_pages,
                               page=page)
    except Exception as e:
        app.logger.error(f"Error in admin_dashboard: {str(e)}", exc_info=True)
        return render_template('admin_dashboard.html',
                               error=f'Failed to load dashboard data: {str(e)}',
                               attendance_records=[],
                               status_options=[],
                               total_employees=0,
                               present_count=0,
                               late_count=0,
                               pending_requests=0,
                               total_records=0,
                               total_pages=0,
                               page=1)

@app.route('/admin/api/attendance_stats', methods=['GET'])
@admin_required
def admin_api_attendance_stats():
    """Placeholder for attendance statistics API (e.g., for charts)."""
    # This function is no longer directly used in the HTML but kept for completeness
    # if charts or specific stats are reintroduced via API calls.
    return jsonify({'labels': [], 'data': []})

@app.route('/admin/api/department_stats', methods=['GET'])
@admin_required
def admin_api_department_stats():
    """Placeholder for department statistics API (e.g., for charts)."""
    # This function is no longer directly used in the HTML but kept for completeness
    # if charts or specific stats are reintroduced via API calls.
    return jsonify({'labels': [], 'data': []})

@app.route('/admin/regularization')
@admin_required
def admin_regularization():
    """Renders the admin regularization requests history page."""
    try:
        employee_filter = request.args.get('employee', '').strip()
        start_date = request.args.get('start_date', '').strip()
        end_date = request.args.get('end_date', '').strip()
        page = int(request.args.get('page', 1))
        per_page = 10
        skip = (page - 1) * per_page

        query = {"status": "Regularized"}

        if start_date:
            query["date"] = {"$gte": start_date}
        if end_date:
            query.setdefault("date", {}).update({"$lte": end_date})

        if employee_filter:
            # Search by exact emp_id or full_name (case-insensitive)
            user_ids_from_name_search = list(users_collection.find(
                {"full_name": {'$regex': employee_filter, '$options': 'i'}},
                {"emp_id": 1}
            ))
            matched_emp_ids = [u['emp_id'] for u in user_ids_from_name_search]

            if matched_emp_ids:
                query["$or"] = [{"emp_id": {"$in": matched_emp_ids}}]
            else:
                # If no name match, assume it's an exact emp_id search
                query["emp_id"] = employee_filter


        total_records = attendance_collection.count_documents(query)
        total_pages = (total_records + per_page - 1) // per_page

        # Pipeline to fetch regularized records with historical original times
        pipeline = [
            {"$match": query},
            {"$sort": {"date": -1, "regularized_at": -1}}, # Sort by date and then by regularization time
            {"$skip": skip},
            {"$limit": per_page},
            {
                "$lookup": {
                    "from": "users",
                    "localField": "emp_id",
                    "foreignField": "emp_id",
                    "as": "user_info"
                }
            },
            {"$unwind": {"path": "$user_info", "preserveNullAndEmptyArrays": True}},
            {
                "$lookup": {
                    "from": "attendance",
                    "let": {"emp_id_val": "$emp_id", "date_val": "$date"},
                    "pipeline": [
                        {"$match": {
                            "$expr": {
                                "$and": [
                                    {"$eq": ["$emp_id", "$$emp_id_val"]},
                                    {"$eq": ["$date", "$$date_val"]},
                                    {"$eq": ["$status", "Historical"]} # Look for the historical record
                                ]
                            }
                        }},
                        {"$sort": {"punch_in": 1}}, # Get the original entry if multiple historical
                        {"$limit": 1}
                    ],
                    "as": "historical_records"
                }
            },
            {
                "$addFields": {
                    "historical_record": {"$arrayElemAt": ["$historical_records", 0]},
                    "full_name": {"$ifNull": ["$user_info.full_name", "Unknown"]}
                }
            },
            {
                "$project": {
                    "id": {"$toString": "$_id"}, # Convert ObjectId to string for display
                    "full_name": 1,
                    "emp_id": 1,
                    "date": 1,
                    "original_punch_in": {"$ifNull": ["$historical_record.punch_in", "-"]},
                    "original_punch_out": {"$ifNull": ["$historical_record.punch_out", "-"]},
                    "modified_punch_in": "$punch_in",
                    "modified_punch_out": "$punch_out",
                    "regularized_reason": 1,
                    "status": 1,
                    "regularized_comments": 1
                }
            }
        ]

        regularization_records_display = list(attendance_collection.aggregate(pipeline))

        def format_time_for_display(val):
            """Helper to format ISO time strings to HH:MM or return default."""
            try:
                if val and val != '-':
                    return datetime.datetime.fromisoformat(val).strftime('%H:%M')
            except ValueError:
                pass # If it's not a valid isoformat, keep original value or return default
            return val or '-'

        # Format dates and times for the template
        for rec in regularization_records_display:
            rec['date'] = datetime.datetime.fromisoformat(rec['date']).strftime('%Y-%m-%d') if rec.get('date') else '-'
            rec['original_punch_in'] = format_time_for_display(rec['original_punch_in'])
            rec['original_punch_out'] = format_time_for_display(rec['original_punch_out'])
            rec['modified_punch_in'] = format_time_for_display(rec['modified_punch_in'])
            rec['modified_punch_out'] = format_time_for_display(rec['modified_punch_out'])
            rec['reason'] = rec.get('regularized_reason', '-') or '-'
            rec['comments'] = rec.get('regularized_comments', '-') or '-'


        return render_template('admin_regularization.html',
                               regularization_records=regularization_records_display,
                               employee_filter=employee_filter,
                               start_date=start_date,
                               end_date=end_date,
                               total_records=total_records,
                               total_pages=total_pages,
                               page=page,
                               per_page=per_page)

    except Exception as e:
        app.logger.error(f"Error in admin_regularization: {str(e)}", exc_info=True)
        return render_template('admin_regularization.html',
                               error=f'Failed to load regularization records: {str(e)}',
                               regularization_records=[],
                               total_records=0,
                               total_pages=0,
                               page=1)

@app.route('/admin/export_employees')
@admin_required
def export_employees():
    """Exports employee data based on filters."""
    try:
        search = request.args.get('search', '').strip()
        department = request.args.get('department', '').strip()
        format_type = request.args.get('format', 'csv').lower()

        query = {}
        if search:
            regex = {'$regex': search, '$options': 'i'}
            query['$or'] = [
                {'full_name': regex},
                {'emp_id': regex},
                {'email': regex},
                {'personal_email': regex}
            ]
        if department:
            query['department'] = department

        employees = list(users_collection.find(query))

        headers = ["Employee ID", "Full Name", "Company Email", "Personal Email", "Department", "Position"]
        data = []

        for emp in employees:
            data.append([
                emp.get('emp_id', '-'),
                emp.get('full_name', '-'),
                emp.get('email', '-'),
                emp.get('personal_email', '-') or '-', # Handle None
                emp.get('department', 'Not assigned') or 'Not assigned', # Handle None
                emp.get('position', 'Not assigned') or 'Not assigned' # Handle None
            ])

        return export_data(data, headers, "employees", format_type)

    except Exception as e:
        app.logger.error(f"Error exporting employees: {str(e)}", exc_info=True)
        return redirect(url_for('admin_emp_manage', error=f'Failed to export employee data: {str(e)}'))


@app.route('/admin/export_attendance')
@admin_required
def export_attendance():
    """Exports attendance data based on filters."""
    try:
        start_date = request.args.get('start_date', '').strip()
        end_date = request.args.get('end_date', '').strip()
        emp_id_filter = request.args.get('emp_id', '').strip()
        status_filter = request.args.get('status', '').strip()
        format_type = request.args.get('format', 'csv').lower()

        query = {"status": {"$ne": "Historical"}} # Exclude historical records by default

        if start_date:
            query['date'] = {'$gte': start_date}
        if end_date:
            query.setdefault('date', {}).update({'$lte': end_date})

        if emp_id_filter:
            # Search by exact emp_id or full_name (case-insensitive)
            user_ids_from_name_search = list(users_collection.find(
                {"full_name": {'$regex': emp_id_filter, '$options': 'i'}},
                {"emp_id": 1}
            ))
            matched_emp_ids = [u['emp_id'] for u in user_ids_from_name_search]

            if matched_emp_ids:
                query["emp_id"] = {"$in": matched_emp_ids}
            else:
                # If no name match, assume it's an exact emp_id search
                query["emp_id"] = emp_id_filter

        if status_filter:
            query['status'] = status_filter

        # Join attendance with user full name
        pipeline = [
            {'$match': query},
            {'$sort': {'date': -1, 'punch_in': 1}}, # Sort by date descending, then punch_in ascending
            {
                '$lookup': {
                    'from': 'users',
                    'localField': 'emp_id',
                    'foreignField': 'emp_id',
                    'as': 'user_info'
                }
            },
            {'$unwind': {'path': '$user_info', 'preserveNullAndEmptyArrays': True}},
            {
                '$project': {
                    'emp_id': 1,
                    'date': 1,
                    'punch_in': 1,
                    'punch_out': 1,
                    'punch_in_address': '$address',
                    'punch_out_address': '$punch_out_address',
                    'status': 1,
                    'full_name': {'$ifNull': ['$user_info.full_name', 'Unknown']}
                }
            }
        ]

        records = list(attendance_collection.aggregate(pipeline))

        headers = ["Employee Name", "Employee ID", "Date", "Punch In", "Punch Out",
                   "Punch In Location", "Punch Out Location", "Status"]
        data = []

        def format_time_for_export(time_str):
            """Helper to format ISO time strings to HH:MM:SS or return default."""
            try:
                if time_str:
                    return datetime.datetime.fromisoformat(time_str).strftime('%H:%M:%S')
            except ValueError:
                pass
            return '-'

        for rec in records:
            data.append([
                rec.get('full_name', '-'),
                rec.get('emp_id', '-'),
                datetime.datetime.fromisoformat(rec['date']).strftime('%Y-%m-%d') if rec.get('date') else '-',
                format_time_for_export(rec.get('punch_in')),
                format_time_for_export(rec.get('punch_out')),
                rec.get('punch_in_address', '-') or '-',
                rec.get('punch_out_address', '-') or '-',
                rec.get('status', '-') or '-'
            ])

        return export_data(data, headers, "attendance_records", format_type)

    except Exception as e:
        app.logger.error(f"Error exporting attendance: {str(e)}", exc_info=True)
        return redirect(url_for('admin_dashboard', error=f'Failed to export attendance data: {str(e)}'))


@app.route('/admin/export_regularization')
@admin_required
def export_regularization():
    """Exports regularization records based on filters."""
    try:
        employee_filter = request.args.get('employee', '').strip()
        start_date = request.args.get('start_date', '').strip()
        end_date = request.args.get('end_date', '').strip()
        format_type = request.args.get('format', 'csv').lower()

        # Match filter for regularized records
        match_stage = {
            'status': 'Regularized'
        }
        if employee_filter:
            # Search by exact emp_id or full_name (case-insensitive)
            user_ids_from_name_search = list(users_collection.find(
                {"full_name": {'$regex': employee_filter, '$options': 'i'}},
                {"emp_id": 1}
            ))
            matched_emp_ids = [u['emp_id'] for u in user_ids_from_name_search]

            if matched_emp_ids:
                match_stage['$or'] = [{"emp_id": {"$in": matched_emp_ids}}]
            else:
                # If no name match, assume it's an exact emp_id search
                match_stage["emp_id"] = employee_filter

        if start_date:
            match_stage['date'] = {'$gte': start_date}
        if end_date:
            match_stage.setdefault('date', {}).update({'$lte': end_date})

        # Aggregate pipeline to get original and modified times
        pipeline = [
            {'$match': match_stage},
            {'$sort': {'date': -1, 'regularized_at': -1}}, # Sort by date and then by regularization time
            {
                '$lookup': {
                    'from': 'users',
                    'localField': 'emp_id',
                    'foreignField': 'emp_id',
                    'as': 'user_info'
                }
            },
            {'$unwind': {'path': '$user_info', 'preserveNullAndEmptyArrays': True}},
            {
                '$lookup': {
                    'from': 'attendance',
                    'let': {'emp_id_val': '$emp_id', 'date_val': '$date'},
                    'pipeline': [
                        {'$match': {
                            '$expr': {
                                '$and': [
                                    {'$eq': ['$emp_id', '$$emp_id_val']},
                                    {'$eq': ['$date', '$$date_val']},
                                    {'$eq': ['$status', 'Historical']}
                                ]
                            }
                        }},
                        {'$sort': {'punch_in': 1}}, # Get the earliest original punch for 'historical' record
                        {'$limit': 1}
                    ],
                    'as': 'historical_records'
                }
            },
            {
                '$addFields': {
                    'historical': {'$arrayElemAt': ['$historical_records', 0]}, # Get the first historical record
                    'full_name': {'$ifNull': ['$user_info.full_name', 'Unknown']} # Default to 'Unknown' if user not found
                }
            },
            {
                '$project': {
                    'emp_id': 1,
                    'full_name': 1,
                    'date': 1,
                    'original_punch_in': {'$ifNull': ['$historical.punch_in', '-']}, # Use '-' if no historical
                    'original_punch_out': {'$ifNull': ['$historical.punch_out', '-']}, # Use '-' if no historical
                    'modified_punch_in': '$punch_in',
                    'modified_punch_out': '$punch_out',
                    'regularized_reason': 1,
                    'status': 1,
                    'regularized_comments': 1
                }
            }
        ]

        records_to_export = list(attendance_collection.aggregate(pipeline))

        headers = ["Employee Name", "Employee ID", "Date",
                   "Original Punch In", "Original Punch Out",
                   "Modified Punch In", "Modified Punch Out",
                   "Reason", "Status", "Comments"]
        data = []

        def format_time_for_export(time_str):
            """Helper to format ISO time strings to HH:MM:SS or return default."""
            try:
                if time_str and time_str != '-':
                    return datetime.datetime.fromisoformat(time_str).strftime('%H:%M:%S')
            except ValueError:
                pass
            return '-'

        for r in records_to_export:
            data.append([
                r.get('full_name', '-'),
                r.get('emp_id', '-'),
                datetime.datetime.fromisoformat(r['date']).strftime('%Y-%m-%d') if r.get('date') else '-',
                format_time_for_export(r.get('original_punch_in')),
                format_time_for_export(r.get('original_punch_out')),
                format_time_for_export(r.get('modified_punch_in')),
                format_time_for_export(r.get('modified_punch_out')),
                r.get('regularized_reason', '-') or '-',
                r.get('status', '-') or '-',
                r.get('regularized_comments', '-') or '-'
            ])

        return export_data(data, headers, "regularization_records", format_type)

    except Exception as e:
        app.logger.error(f"Error exporting regularization records: {str(e)}", exc_info=True)
        return redirect(url_for('admin_regularization', error=f'Failed to export regularization data: {str(e)}'))

@app.route('/update_password', methods=['POST'])
def update_password():
    """Allows an authenticated employee to change their password."""
    if 'user' not in session:
        return jsonify({'success': False, 'message': 'Authentication required.'}), 401

    try:
        data = request.get_json()
        current_password = data.get('current_password')
        new_password = data.get('new_password')
        confirm_password = data.get('confirm_password')

        if not all([current_password, new_password, confirm_password]):
            return jsonify({'success': False, 'message': 'All password fields are required.'}), 400

        if new_password != confirm_password:
            return jsonify({'success': False, 'message': 'New password and confirm password do not match.'}), 400

        is_strong, password_message = _validate_password_complexity(new_password)
        if not is_strong:
            return jsonify({'success': False, 'message': password_message}), 400

        emp_id = session['user']['emp_id']
        user = users_collection.find_one({'emp_id': emp_id})

        if not user or not check_password_hash(user['password'], current_password):
            return jsonify({'success': False, 'message': 'Current password is incorrect.'}), 401

        hashed_password = generate_password_hash(new_password)
        users_collection.update_one({'emp_id': emp_id}, {'$set': {'password': hashed_password}})

        return jsonify({'success': True, 'message': 'Password updated successfully.'}), 200

    except Exception as e:
        app.logger.error(f"Error updating password for employee {session['user'].get('emp_id', 'N/A')}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': 'An unexpected error occurred while updating your password. Please try again.'}), 500

@app.route('/employee/api/profile', methods=['PUT'])
def update_employee_profile():
    """Allows an authenticated employee to update their profile (e.g., personal email)."""
    if 'user' not in session:
        return jsonify({'success': False, 'message': 'Authentication required.'}), 401

    try:
        data = request.get_json()
        personal_email = data.get('personal_email')
        emp_id = session['user']['emp_id']

        # Ensure personal_email is either None (if clearing) or a valid format
        if personal_email:
            personal_email = personal_email.strip() # Clean whitespace
            if not _validate_email_format(personal_email):
                return jsonify({'success': False, 'message': 'Invalid personal email format.'}), 400
        else:
            personal_email = "" # Store as empty string if user clears it

        update_result = users_collection.update_one(
            {'emp_id': emp_id},
            {'$set': {'personal_email': personal_email}}
        )

        if update_result.matched_count == 0:
            return jsonify({'success': False, 'message': 'Employee not found or no changes were made.'}), 404

        # Update session data immediately to reflect changes in UI
        session['user']['personal_email'] = personal_email

        return jsonify({'success': True, 'message': 'Profile updated successfully!'}), 200

    except Exception as e:
        app.logger.error(f"Error updating employee profile for {session['user'].get('emp_id', 'N/A')}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': f'An unexpected error occurred while updating your profile: {str(e)}'}), 500


@app.route('/forgot_password', methods=['POST'])
def forgot_password():
    """Initiates password reset by sending an OTP to the user's personal email."""
    try:
        data = request.get_json()
        emp_id = data.get('empId', '').strip()
        personal_email = data.get('personalEmail', '').strip()

        if not emp_id or not personal_email:
            return jsonify({'success': False, 'message': 'Employee ID and personal email are required.'}), 400

        if len(emp_id) < MIN_EMPLOYEE_ID_LENGTH:
             return jsonify({'success': False, 'message': f'Employee ID must be at least {MIN_EMPLOYEE_ID_LENGTH} characters long.'}), 400
        if not _validate_email_format(personal_email):
            return jsonify({'success': False, 'message': 'Invalid personal email format.'}), 400

        user = users_collection.find_one({'emp_id': emp_id})

        if not user:
            return jsonify({'success': False, 'message': 'Employee ID not found.'}), 404

        # Important: Check if the provided personal email matches the one in the database
        if user.get('personal_email') != personal_email:
            return jsonify({'success': False, 'message': 'Provided personal email does not match our records for this Employee ID.'}), 400

        # Generate a 6-digit OTP
        otp = ''.join([str(random.randint(0, 9)) for _ in range(6)])
        # OTP valid for 5 minutes
        expiry_time = datetime.datetime.now() + datetime.timedelta(minutes=5)

        # Store OTP in the DB, replacing any existing token for this emp_id
        password_reset_tokens.update_one(
            {'emp_id': emp_id},
            {'$set': {'token': otp, 'expiry': expiry_time, 'created_at': datetime.datetime.now()}},
            upsert=True # Create if not exists, update if exists
        )

        # Send OTP via email using environment variables for credentials
        try:
            msg = EmailMessage()
            msg['Subject'] = "ArgusScan Password Reset OTP"
            msg['From'] = os.getenv("GMAIL_USER")
            msg['To'] = personal_email
            msg.set_content(f"Your One-Time Password (OTP) for ArgusScan password reset is: {otp}\n\nThis code is valid for 5 minutes. If you did not request this, please ignore this email.")

            # Use with statement for SMTP for proper closing
            with smtplib.SMTP('smtp.gmail.com', 587) as server:
                server.starttls()
                server.login(os.getenv("GMAIL_USER"), os.getenv("GMAIL_PASSWORD"))
                server.send_message(msg)

            return jsonify({'success': True, 'message': 'A verification code has been sent to your personal email.'}), 200
        except Exception as e:
            app.logger.error(f"Error sending password reset OTP email to {personal_email}: {str(e)}", exc_info=True)
            return jsonify({'success': False, 'message': 'Failed to send verification code. Please check your email settings or try again later.'}), 500

    except Exception as e:
        app.logger.error(f"Error in forgot_password route: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': 'An unexpected error occurred. Please try again.'}), 500


@app.route('/verify_reset_code', methods=['POST'])
def verify_reset_code():
    """Verifies the OTP sent for password reset."""
    try:
        data = request.get_json()
        emp_id = data.get('empId', '').strip()
        code = data.get('code', '').strip()

        if not emp_id or not code:
            return jsonify({'success': False, 'message': 'Employee ID and verification code are required.'}), 400

        token_entry = password_reset_tokens.find_one({'emp_id': emp_id})

        if not token_entry:
            return jsonify({'success': False, 'message': 'No verification code found for this Employee ID. Please request a new one.'}), 400

        expiry = token_entry.get('expiry')
        stored_token = token_entry.get('token')

        if not expiry or datetime.datetime.now() > expiry:
            # Delete expired token
            password_reset_tokens.delete_one({'emp_id': emp_id})
            return jsonify({'success': False, 'message': 'The verification code has expired. Please request a new one.'}), 400

        if code == stored_token:
            return jsonify({'success': True, 'message': 'Verification code successfully verified.'}), 200
        else:
            return jsonify({'success': False, 'message': 'Invalid verification code.'}), 400

    except Exception as e:
        app.logger.error(f"Error in verify_reset_code route: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': 'An unexpected error occurred during code verification. Please try again.'}), 500


@app.route('/reset_password', methods=['POST'])
def reset_password():
    """Resets the user's password after successful OTP verification."""
    try:
        data = request.get_json()
        emp_id = data.get('empId', '').strip()
        new_password = data.get('newPassword')

        if not emp_id or not new_password:
            return jsonify({'success': False, 'message': 'Employee ID and new password are required.'}), 400

        is_strong, password_message = _validate_password_complexity(new_password)
        if not is_strong:
            return jsonify({'success': False, 'message': password_message}), 400

        user = users_collection.find_one({'emp_id': emp_id})
        if not user:
            return jsonify({'success': False, 'message': 'Employee ID not found.'}), 404

        hashed_password = generate_password_hash(new_password)

        # Update password in users collection
        users_collection.update_one(
            {'emp_id': emp_id},
            {'$set': {'password': hashed_password}}
        )

        # Remove used OTP token to prevent reuse
        password_reset_tokens.delete_one({'emp_id': emp_id})

        return jsonify({'success': True, 'message': 'Your password has been successfully reset.'}), 200

    except Exception as e:
        app.logger.error(f"Error in reset_password route for employee {emp_id}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': 'An unexpected error occurred during password reset. Please try again.'}), 500


@app.route('/admin/employees')
@admin_required
def admin_emp_manage():
    """Renders the admin employee management page."""
    return render_template('admin_emp_manage.html')

@app.route('/admin/api/employees', methods=['GET', 'POST'])
@admin_required
def admin_api_employees():
    """API endpoint for managing employee data (fetch all, add new)."""
    if request.method == 'GET':
        search = request.args.get('search', '').strip()
        department = request.args.get('department', '').strip()

        query = {}
        if search:
            regex = {'$regex': search, '$options': 'i'}
            query['$or'] = [
                {'full_name': regex},
                {'emp_id': regex},
                {'email': regex},
                {'personal_email': regex}
            ]
        if department:
            query['department'] = department

        employees = list(users_collection.find(query, {
            'emp_id': 1, 'full_name': 1, 'email': 1,
            'personal_email': 1, 'image_path': 1,
            'department': 1, 'position': 1
        }))

        result = []
        for emp in employees:
            image_url = url_for('uploaded_file', filename=os.path.basename(emp.get('image_path', ''))) if emp.get('image_path') and os.path.exists(emp.get('image_path')) else 'https://via.placeholder.com/40'
            result.append({
                'emp_id': emp.get('emp_id', '-'),
                'full_name': emp.get('full_name', '-'),
                'email': emp.get('email', '-'),
                'personal_email': emp.get('personal_email', '') or '-', # Use empty string for display if None
                'image_path': image_url, # Convert to URL
                'department': emp.get('department', 'Not assigned') or 'Not assigned', # Ensure default
                'position': emp.get('position', 'Not assigned') or 'Not assigned' # Ensure default
            })
        return jsonify(result), 200

    elif request.method == 'POST':
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid request data.'}), 400

        # Server-side validation for required fields
        full_name = data.get('fullName')
        emp_id = data.get('employeeId')
        email = data.get('email')
        personal_email = data.get('personalEmail')
        department = data.get('department')
        position = data.get('position')
        password = data.get('password')
        photo_data = data.get('photoData') # Base64 string

        if not all([full_name, emp_id, email, department, position, password]):
            return jsonify({'error': 'Missing required fields (Full Name, Employee ID, Company Email, Department, Position, Password).'}), 400

        if len(emp_id) < MIN_EMPLOYEE_ID_LENGTH:
            return jsonify({'error': f'Employee ID must be at least {MIN_EMPLOYEE_ID_LENGTH} characters long.'}), 400

        if not _validate_email_format(email):
            return jsonify({'error': 'Invalid company email format.'}), 400
        if not email.endswith('@innovasolutions.com'):
            return jsonify({'error': 'Company email must end with @innovasolutions.com.'}), 400

        if personal_email and not _validate_email_format(personal_email):
            return jsonify({'error': 'Invalid personal email format.'}), 400

        is_strong, password_message = _validate_password_complexity(password)
        if not is_strong:
            return jsonify({'error': password_message}), 400

        try:
            # Check for existing employee ID or email
            existing_user = users_collection.find_one({
                '$or': [
                    {'emp_id': emp_id},
                    {'email': email}
                ]
            })
            if existing_user:
                if existing_user.get('emp_id') == emp_id:
                    return jsonify({'error': f'Employee ID "{emp_id}" already exists.'}), 409 # Conflict
                if existing_user.get('email') == email:
                    return jsonify({'error': f'Company email "{email}" already exists.'}), 409 # Conflict

            # Process photo using the refactored helper
            face_encoding = []
            image_path = 'https://via.placeholder.com/40' # Default placeholder
            if photo_data:
                try:
                    face_encoding, image_path = _process_and_encode_face(photo_data, emp_id)
                except ValueError as ve:
                    # Specific error messages from face processing
                    return jsonify({'error': str(ve)}), 400
                except Exception as e:
                    app.logger.error(f"Error processing photo for new employee {emp_id}: {e}")
                    return jsonify({'error': 'Failed to process employee photo.'}), 500

            # Insert new employee
            hashed_password = generate_password_hash(password)
            users_collection.insert_one({
                'emp_id': emp_id,
                'full_name': full_name,
                'email': email,
                'personal_email': personal_email or "",
                'department': department,
                'position': position,
                'password': hashed_password,
                'image_path': image_path,
                'face_encoding': face_encoding
            })

            return jsonify({'success': True, 'message': 'Employee added successfully.'}), 201

        except Exception as e:
            app.logger.error(f"Error in POST /admin/api/employees: {str(e)}", exc_info=True)
            return jsonify({'error': f'An unexpected error occurred: {str(e)}'}), 500


@app.route('/admin/api/employees/<emp_id>', methods=['GET', 'PUT', 'DELETE'])
@admin_required
def admin_api_single_employee(emp_id):
    """API endpoint for fetching, updating, or deleting a single employee."""
    # Ensure emp_id in URL matches a valid format if necessary (e.g., min length)
    if not emp_id or len(emp_id) < MIN_EMPLOYEE_ID_LENGTH:
        return jsonify({'error': 'Invalid Employee ID provided in URL.'}), 400

    if request.method == 'GET':
        emp = users_collection.find_one({'emp_id': emp_id})
        if not emp:
            return jsonify({'error': 'Employee not found.'}), 404

        image_url = url_for('uploaded_file', filename=os.path.basename(emp.get('image_path', ''))) if emp.get('image_path') and os.path.exists(emp.get('image_path')) else 'https://via.placeholder.com/40'

        return jsonify({
            'emp_id': emp.get('emp_id', '-'),
            'full_name': emp.get('full_name', '-'),
            'email': emp.get('email', '-'),
            'personal_email': emp.get('personal_email', '') or '',
            'department': emp.get('department', 'Not assigned') or 'Not assigned',
            'position': emp.get('position', 'Not assigned') or 'Not assigned',
            'image_path': image_url
        }), 200

    elif request.method == 'PUT':
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No update data provided.'}), 400

        update_data = {}

        # Validate and prepare fields for update
        if 'fullName' in data:
            if not data['fullName'].strip():
                return jsonify({'error': 'Full Name cannot be empty.'}), 400
            update_data['full_name'] = data['fullName'].strip()

        if 'personalEmail' in data:
            personal_email = data['personalEmail'].strip()
            if personal_email and not _validate_email_format(personal_email):
                return jsonify({'error': 'Invalid personal email format.'}), 400
            update_data['personal_email'] = personal_email

        if 'department' in data:
            update_data['department'] = data['department'].strip() if data['department'] else 'Not assigned'

        if 'position' in data:
            if not data['position'].strip():
                 return jsonify({'error': 'Position cannot be empty.'}), 400
            update_data['position'] = data['position'].strip() if data['position'] else 'Not assigned'

        if 'password' in data and data['password']:
            new_password = data['password']
            is_strong, password_message = _validate_password_complexity(new_password)
            if not is_strong:
                return jsonify({'error': password_message}), 400
            update_data['password'] = generate_password_hash(new_password)

        if not update_data:
            return jsonify({'error': 'No valid fields provided for update.'}), 400

        result = users_collection.update_one({'emp_id': emp_id}, {'$set': update_data})

        if result.matched_count == 0:
            return jsonify({'error': 'Employee not found or no changes made.'}), 404
        if result.modified_count == 0 and result.matched_count == 1:
            return jsonify({'success': True, 'message': 'No changes detected, but request was valid.'}), 200

        return jsonify({'success': True, 'message': 'Employee updated successfully.'}), 200

    elif request.method == 'DELETE':
        emp = users_collection.find_one({'emp_id': emp_id})
        if not emp:
            return jsonify({'error': 'Employee not found.'}), 404

        image_path = emp.get('image_path')

        # Delete from users collection
        users_collection.delete_one({'emp_id': emp_id})

        # Delete attendance records
        attendance_collection.delete_many({'emp_id': emp_id})
        # Delete password reset tokens
        password_reset_tokens.delete_many({'emp_id': emp_id})


        # Delete photo if it's a local file and exists
        if image_path and not image_path.startswith(('http://', 'https://')) and os.path.exists(image_path):
            try:
                os.remove(image_path)
                # Attempt to remove the faces directory if it becomes empty
                dir_path = os.path.dirname(image_path)
                if os.path.exists(dir_path) and not os.listdir(dir_path):
                    os.rmdir(dir_path)
            except OSError as e:
                app.logger.error(f"Error deleting employee photo file {image_path}: {e}")
                return jsonify({
                    'success': True,
                    'warning': f'Employee deleted but photo file could not be removed: {e}'
                }), 200 # Still success, but with warning
            except Exception as e:
                app.logger.error(f"Unexpected error deleting employee photo {image_path}: {e}")
                return jsonify({
                    'success': True,
                    'warning': f'Employee deleted but an unexpected error occurred while removing photo: {e}'
                }), 200 # Still success, but with warning

        return jsonify({'success': True, 'message': 'Employee and all associated records deleted successfully.'}), 200


@app.route('/admin/api/bulk_import', methods=['POST'])
@admin_required
def bulk_import_employees():
    """Handles bulk import of employee data, including face photos."""
    employees_data = request.get_json()
    if not employees_data or not isinstance(employees_data, list):
        return jsonify({'error': 'Invalid request: Expected a list of employee objects.'}), 400

    successful_imports = 0
    failed_imports = 0
    errors = []

    for emp_data in employees_data:
        emp_id = str(emp_data.get('employeeId', '')).strip() # Changed from 'emp_id' to 'employeeId' for consistency with frontend bulk add
        full_name = emp_data.get('fullName', '').strip() # Changed from 'full_name' to 'fullName'
        email = emp_data.get('email', '').strip()
        personal_email = emp_data.get('personalEmail', '').strip() # Changed from 'personal_email' to 'personalEmail'
        department = emp_data.get('department', '').strip()
        position = emp_data.get('position', '').strip()
        password = str(emp_data.get('password', '')).strip()
        photo_data = emp_data.get('photoData') # Base64 image data from frontend or image_filename for file upload

        # Basic validation for essential fields
        if not all([emp_id, full_name, email, department, position, password]):
            failed_imports += 1
            errors.append(f"Missing required fields for employee ID {emp_id}.")
            continue

        if len(emp_id) < MIN_EMPLOYEE_ID_LENGTH:
            failed_imports += 1
            errors.append(f"Employee ID '{emp_id}' is too short (min {MIN_EMPLOYEE_ID_LENGTH} characters).")
            continue

        if not _validate_email_format(email) or not email.endswith('@innovasolutions.com'):
            failed_imports += 1
            errors.append(f"Invalid company email format for employee ID '{emp_id}'. Must be @innovasolutions.com.")
            continue

        if personal_email and not _validate_email_format(personal_email):
            failed_imports += 1
            errors.append(f"Invalid personal email format for employee ID '{emp_id}'.")
            continue

        is_strong, password_message = _validate_password_complexity(password)
        if not is_strong:
            failed_imports += 1
            errors.append(f"Weak password for employee ID '{emp_id}': {password_message}")
            continue

        try:
            # Check for existing employee ID or email before processing photo
            existing = users_collection.find_one({
                '$or': [
                    {'emp_id': emp_id},
                    {'email': email}
                ]
            })
            if existing:
                if existing.get('emp_id') == emp_id:
                    errors.append(f"Employee ID '{emp_id}' already exists. Skipping.")
                elif existing.get('email') == email:
                    errors.append(f"Company email '{email}' already exists for employee ID '{emp_id}'. Skipping.")
                failed_imports += 1
                continue

            face_encoding = []
            image_path = 'https://via.placeholder.com/40' # Default placeholder if no photo provided/processed

            if photo_data:
                try:
                    face_encoding, image_path = _process_and_encode_face(photo_data, emp_id)
                except ValueError as ve:
                    # Specific error from face processing (e.g., no face, duplicate face)
                    errors.append(f"Error processing photo for employee ID '{emp_id}': {str(ve)}")
                    failed_imports += 1
                    continue # Skip to next employee
                except Exception as e:
                    # General error during photo processing
                    app.logger.error(f"Unexpected error during photo processing for bulk import employee {emp_id}: {e}")
                    errors.append(f"Failed to process photo for employee ID '{emp_id}' due to an internal error.")
                    failed_imports += 1
                    continue

            hashed_password = generate_password_hash(password)
            users_collection.insert_one({
                'emp_id': emp_id,
                'full_name': full_name,
                'email': email,
                'personal_email': personal_email,
                'department': department,
                'position': position,
                'password': hashed_password,
                'image_path': image_path,
                'face_encoding': face_encoding
            })

            successful_imports += 1

        except Exception as e:
            app.logger.error(f"Error importing employee {emp_id}: {str(e)}", exc_info=True)
            failed_imports += 1
            errors.append(f"Failed to import employee ID '{emp_id}' due to an unexpected error: {str(e)}")
            continue

    status_message = f"Bulk import complete. Successful: {successful_imports}, Failed: {failed_imports}."
    if errors:
        status_message += " Details: " + "; ".join(errors)

    if failed_imports > 0:
        return jsonify({'successful': successful_imports, 'failed': failed_imports, 'error': status_message}), 400
    else:
        return jsonify({'successful': successful_imports, 'failed': failed_imports, 'message': status_message}), 200


@app.route('/admin/send_employee_email', methods=['POST'])
@admin_required
def send_employee_email():
    """Allows admin to send an email to an employee."""
    try:
        data = request.get_json()
        to = data.get('to')
        subject = data.get('subject')
        message = data.get('message')

        if not all([to, subject, message]):
            return jsonify({'success': False, 'message': 'Missing recipient, subject, or message body.'}), 400

        if not _validate_email_format(to):
            return jsonify({'success': False, 'message': 'Invalid recipient email format.'}), 400

        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = os.getenv("GMAIL_USER")
        msg['To'] = to
        msg.set_content(message, subtype='html') # Send as HTML
        # msg.add_alternative(message, subtype='html') # Could add plain text alternative too

        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            server.login(os.getenv("GMAIL_USER"), os.getenv("GMAIL_PASSWORD"))
            server.send_message(msg)

        return jsonify({'success': True, 'message': 'Email sent successfully!'}), 200
    except Exception as e:
        app.logger.error(f"Error sending email from admin panel to {to}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': f'Failed to send email: {str(e)}'}), 500

@app.route('/admin/api/send_report_email', methods=['POST'])
@admin_required
def admin_api_send_report_email():
    """Allows admin to send an attendance report email."""
    try:
        data = request.get_json()
        to_email = data.get('to')
        subject = data.get('subject')
        message_body = data.get('message')

        if not all([to_email, subject, message_body]):
            return jsonify({'success': False, 'message': 'Missing recipient, subject, or message body.'}), 400

        if not _validate_email_format(to_email):
            return jsonify({'success': False, 'message': 'Invalid recipient email format.'}), 400

        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = os.getenv("GMAIL_USER")
        msg['To'] = to_email
        msg.set_content(message_body, subtype='html') # Send as HTML

        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            server.login(os.getenv("GMAIL_USER"), os.getenv("GMAIL_PASSWORD"))
            server.send_message(msg)

        return jsonify({'success': True, 'message': 'Attendance report email sent successfully!'}), 200

    except Exception as e:
        app.logger.error(f"Error sending report email to {to_email}: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': f'Failed to send report email: {str(e)}'}), 500

@app.route('/admin/api/employee_personal_emails', methods=['GET'])
@admin_required
def get_employee_personal_emails():
    """API endpoint to get employee full names and personal emails."""
    try:
        employees = users_collection.find({"personal_email": {"$ne": ""}}, {"full_name": 1, "personal_email": 1, "emp_id": 1})
        result = []
        for emp in employees:
            result.append({
                'full_name': emp.get('full_name'),
                'personal_email': emp.get('personal_email'),
                'emp_id': emp.get('emp_id')
            })
        return jsonify(result), 200
    except Exception as e:
        app.logger.error(f"Error fetching employee personal emails: {e}")
        return jsonify({"success": False, "message": "Failed to fetch employee personal emails."}), 500

@app.route('/admin/api/attendance_records_for_employee', methods=['GET'])
@admin_required
def get_attendance_records_for_employee():
    """API endpoint to get attendance records for a specific employee (for reports)."""
    emp_id = request.args.get('emp_id')
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')

    if not emp_id:
        return jsonify({"success": False, "message": "Employee ID is required."}), 400

    query_filter = {"emp_id": emp_id, "status": {"$ne": "Historical"}}

    if start_date_str:
        query_filter["date"] = {"$gte": start_date_str}
    if end_date_str:
        query_filter.setdefault("date", {}).update({"$lte": end_date_str})

    try:
        records = list(attendance_collection.find(query_filter).sort([("date", -1), ("punch_in", 1)]))

        formatted_records = []
        for record in records:
            formatted_records.append({
                'date': datetime.datetime.fromisoformat(record['date']).strftime('%Y-%m-%d'),
                'punch_in': datetime.datetime.fromisoformat(record['punch_in']).strftime('%H:%M:%S') if record.get('punch_in') else '-',
                'punch_out': datetime.datetime.fromisoformat(record['punch_out']).strftime('%H:%M:%S') if record.get('punch_out') else '-',
                'status': record.get('status', '-'),
                'punch_in_address': record.get('address', '-') or '-',
                'punch_out_address': record.get('punch_out_address', '-') or '-'
            })
        return jsonify(formatted_records), 200
    except Exception as e:
        app.logger.error(f"Error fetching attendance records for employee {emp_id}: {e}")
        return jsonify({"success": False, "message": "Failed to fetch attendance records."}), 500

@app.route('/admin/api/regularization_records_for_employee', methods=['GET'])
@admin_required
def get_regularization_records_for_employee():
    """API endpoint to get regularization records for a specific employee (for reports)."""
    emp_id = request.args.get('emp_id')
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')

    if not emp_id:
        return jsonify({"success": False, "message": "Employee ID is required."}), 400

    match_query = {"emp_id": emp_id, "status": "Regularized"}

    if start_date_str:
        match_query["date"] = {"$gte": start_date_str}
    if end_date_str:
        match_query.setdefault("date", {}).update({"$lte": end_date_str})

    try:
        pipeline = [
            {"$match": match_query},
            {"$sort": {"date": -1, "regularized_at": -1}},
            {
                "$lookup": {
                    "from": "attendance",
                    "let": {"emp_id_val": "$emp_id", "date_val": "$date"},
                    "pipeline": [
                        {"$match": {
                            "$expr": {
                                "$and": [
                                    {"$eq": ["$emp_id", "$$emp_id_val"]},
                                    {"$eq": ["$date", "$$date_val"]},
                                    {"$eq": ["$status", "Historical"]}
                                ]
                            }
                        }},
                        {"$sort": {"punch_in": 1}},
                        {"$limit": 1}
                    ],
                    "as": "historical_records"
                }
            },
            {
                "$addFields": {
                    "historical": {"$arrayElemAt": ["$historical_records", 0]},
                }
            },
            {
                "$project": {
                    "date": {"$dateToString": {"format": "%Y-%m-%d", "date": {"$dateFromString": {"dateString": "$date"}}}},
                    "original_punch_in": {"$ifNull": ["$historical.punch_in", "-"]},
                    "original_punch_out": {"$ifNull": ["$historical.punch_out", "-"]},
                    "modified_punch_in": "$punch_in",
                    "modified_punch_out": "$punch_out",
                    "regularized_reason": "$regularized_reason",
                    "regularized_comments": {"$ifNull": ["$regularized_comments", "-"]}
                }
            }
        ]

        records = list(attendance_collection.aggregate(pipeline))

        # Format times for display
        def format_time_for_display(val):
            try:
                if val and val != '-':
                    return datetime.datetime.fromisoformat(val).strftime('%H:%M:%S')
            except ValueError:
                pass
            return val or '-'

        for record in records:
            record['original_punch_in'] = format_time_for_display(record['original_punch_in'])
            record['original_punch_out'] = format_time_for_display(record['original_punch_out'])
            record['modified_punch_in'] = format_time_for_display(record['modified_punch_in'])
            record['modified_punch_out'] = format_time_for_display(record['modified_punch_out'])

        return jsonify(records), 200
    except Exception as e:
        app.logger.error(f"Error fetching regularization records for employee {emp_id}: {e}")
        return jsonify({"success": False, "message": "Failed to fetch regularization records."}), 500

@app.route('/logout')
def logout():
    """Logs out the employee user."""
    session.pop('user', None)
    return redirect(url_for('home'))

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'faces'), exist_ok=True)
    init_db()
    debug_mode = os.getenv("FLASK_DEBUG", "False").lower() in ("true", "1", "t")
    app.run(debug=debug_mode, host='0.0.0.0', port=5000)