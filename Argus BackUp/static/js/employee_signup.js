
const video = document.getElementById('signupFacecam');
const canvas = document.getElementById('signupCanvas');
const captureBtn = document.getElementById('captureBtn');
const photoStatus = document.getElementById('photoStatus');
const capturedImage = document.getElementById('capturedImage');
const faceError = document.getElementById('faceError'); // Error for face capture
const empIdError = document.getElementById('empIdError'); // Error for empId
const emailError = document.getElementById('emailError'); // Error for email
const signupForm = document.getElementById('employeeSignupForm');
const signupMessage = document.getElementById('signupMessage'); // General success/error message
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const passwordStrength = document.getElementById('passwordStrength');
const passwordHints = {
  length: document.getElementById('lengthHint'),
  uppercase: document.getElementById('uppercaseHint'),
  number: document.getElementById('numberHint'),
  special: document.getElementById('specialHint')
};
const confirmPasswordError = document.getElementById('confirmPasswordError');

// Toast notification function (unified for employee-facing pages)
function showToast(message, type = 'success') {
  const toastContainer = document.querySelector('.toast-container');
  // Create toast container if it doesn't exist (it should exist in employee_login.html, but safety check)
  if (!toastContainer) {
    const container = document.createElement('div');
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '1100';
    document.body.appendChild(container);
  }

  const toastEl = document.createElement('div');
  // Determine Bootstrap background class based on type
  let bgClass;
  let textClass = 'text-white'; // Default text color for dark backgrounds

  if (type === 'success') {
    bgClass = 'bg-success';
  } else if (type === 'danger') { // Renamed 'error' to 'danger' for Bootstrap consistency
    bgClass = 'bg-danger';
  } else if (type === 'warning') {
    bgClass = 'bg-warning';
    textClass = 'text-dark'; // Warning often has dark text
  } else {
    bgClass = 'bg-info'; // Default for info/other
  }

  toastEl.className = `toast show align-items-center ${bgClass} border-0`;
  toastEl.setAttribute('role', 'alert');
  toastEl.setAttribute('aria-live', 'assertive');
  toastEl.setAttribute('aria-atomic', 'true');

  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body ${textClass}">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;

  document.querySelector('.toast-container').appendChild(toastEl);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    const bsToast = bootstrap.Toast.getInstance(toastEl);
    if (bsToast) {
        bsToast.hide(); // Use Bootstrap's hide method if it's a managed toast
    } else {
        toastEl.remove(); // Fallback if not managed by Bootstrap's JS
    }
    // Remove container if no more toasts after all are gone
    if (toastContainer && toastContainer.children.length === 0) {
      toastContainer.remove();
    }
  }, 5000);
}


// Initialize camera
function initCamera() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }) // Prefer front camera
      .then(stream => {
        video.srcObject = stream;
        video.play(); // Start playing the video stream
      })
      .catch(error => {
        console.error('Camera error:', error);
        showToast('Could not access camera. Please ensure you have granted permissions and no other app is using it.', 'danger');
        faceError.textContent = 'Could not access camera. Please enable it in browser settings.';
        captureBtn.disabled = true;
      });
  } else {
    showToast('Camera API not supported in this browser.', 'danger');
    faceError.textContent = 'Camera API not supported in this browser.';
    captureBtn.disabled = true;
  }
}

// Password strength checker
function checkPasswordStrength(password) {
  let strength = 0;
  let allCriteriaMet = true;

  // Length check (min 8 characters)
  if (password.length >= 8) {
    strength += 25;
    passwordHints.length.classList.replace('invalid', 'valid');
  } else {
    passwordHints.length.classList.replace('valid', 'invalid');
    allCriteriaMet = false;
  }

  // Uppercase check
  if (/[A-Z]/.test(password)) {
    strength += 25;
    passwordHints.uppercase.classList.replace('invalid', 'valid');
  } else {
    passwordHints.uppercase.classList.replace('valid', 'invalid');
    allCriteriaMet = false;
  }

  // Number check
  if (/\d/.test(password)) {
    strength += 25;
    passwordHints.number.classList.replace('invalid', 'valid');
  } else {
    passwordHints.number.classList.replace('valid', 'invalid');
    allCriteriaMet = false;
  }

  // Special char check
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) { // Ensure a good set of special characters
    strength += 25;
    passwordHints.special.classList.replace('invalid', 'valid');
  } else {
    passwordHints.special.classList.replace('valid', 'invalid');
    allCriteriaMet = false;
  }

  // Update strength bar
  passwordStrength.style.width = `${strength}%`;
  passwordStrength.className = 'password-strength-bar';

  if (strength < 50) {
    passwordStrength.classList.add('password-strength-weak'); // Consider adding this CSS class if not present
  } else if (strength < 75) {
    passwordStrength.classList.add('password-strength-medium');
  } else if (strength < 100) {
    passwordStrength.classList.add('password-strength-strong');
  } else {
    passwordStrength.classList.add('password-strength-very-strong');
  }

  return allCriteriaMet; // Return true if all criteria met
}

// Toggle password visibility
function setupPasswordToggle(inputId, toggleId) {
  const input = document.getElementById(inputId);
  const toggle = document.getElementById(toggleId);

  toggle.addEventListener('click', function() {
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);
    this.querySelector('i').classList.toggle('bi-eye-slash-fill');
    this.querySelector('i').classList.toggle('bi-eye-fill');
  });
}

// Capture photo
function capturePhoto() {
  if (video.readyState < 2) { // Ensure video stream is ready
    showToast('Camera not ready. Please wait a moment and try again.', 'warning');
    faceError.textContent = 'Camera not ready. Please wait.';
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = canvas.toDataURL('image/jpeg', 0.9); // Specify quality for smaller file size
  capturedImage.value = imageData;
  photoStatus.style.display = 'block';
  faceError.textContent = '';
  showToast('Photo captured successfully!', 'success');
}

// Function to validate both password fields and update Bootstrap classes
function validatePasswords() {
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  const isPasswordStrong = checkPasswordStrength(password);
  const passwordsMatch = (password === confirmPassword && password.length > 0);

  // Validate password input
  if (!isPasswordStrong) {
    passwordInput.classList.remove('is-valid');
    passwordInput.classList.add('is-invalid');
    // Set custom validity message for native HTML5 validation
    passwordInput.setCustomValidity('Password does not meet strength requirements.');
  } else {
    passwordInput.classList.remove('is-invalid');
    passwordInput.setCustomValidity(''); // Clear custom validation message
  }

  // Validate confirm password input
  if (!passwordsMatch) {
    confirmPasswordInput.classList.remove('is-valid');
    confirmPasswordInput.classList.add('is-invalid');
    confirmPasswordInput.setCustomValidity('Passwords must match.');
    confirmPasswordError.textContent = 'Passwords must match.'; // Custom error message below field
  } else {
    confirmPasswordInput.classList.remove('is-invalid');
    confirmPasswordInput.setCustomValidity(''); // Clear custom validation message
    confirmPasswordError.textContent = ''; // Clear custom error message
  }

  // If both are strong and match, mark both as valid
  if (isPasswordStrong && passwordsMatch) {
    passwordInput.classList.add('is-valid');
    confirmPasswordInput.classList.add('is-valid');
  } else {
    passwordInput.classList.remove('is-valid');
    confirmPasswordInput.classList.remove('is-valid');
  }
  return isPasswordStrong && passwordsMatch;
}

// Form submission
async function submitForm(e) {
  e.preventDefault();

  // Reset previous error messages and styles
  faceError.textContent = '';
  empIdError.textContent = '';
  emailError.textContent = '';
  signupMessage.style.display = 'none';

  // Run all client-side validations
  const isPasswordValid = validatePasswords();
  const isFormValid = signupForm.checkValidity(); // Runs HTML5 validation for other fields

  // Manually validate specific fields that Bootstrap's checkValidity might miss or needs custom logic
  const fullNameInput = document.getElementById('fullName');
  const empIdInput = document.getElementById('empId');
  const emailInput = document.getElementById('email');
  const personalEmailInput = document.getElementById('personalEmail');

  let allClientValidationPassed = true;

  if (!fullNameInput.value.trim()) {
      fullNameInput.classList.add('is-invalid');
      allClientValidationPassed = false;
  } else {
      fullNameInput.classList.remove('is-invalid');
  }

  if (!empIdInput.value.trim() || empIdInput.value.trim().length < 3) { // min length for emp_id
      empIdInput.classList.add('is-invalid');
      empIdError.textContent = 'Employee ID must be at least 3 characters.';
      allClientValidationPassed = false;
  } else {
      empIdInput.classList.remove('is-invalid');
      empIdError.textContent = '';
  }

  if (!emailInput.value.endsWith('@innovasolutions.com')) {
    emailInput.classList.add('is-invalid');
    emailError.textContent = 'Please use your @innovasolutions.com email address.';
    allClientValidationPassed = false;
  } else {
    emailInput.classList.remove('is-invalid');
    emailError.textContent = '';
  }

  if (personalEmailInput.value.trim() && !/^[^\s@]+@[^\s@]+\.[^@]+$/.test(personalEmailInput.value.trim())) {
    personalEmailInput.classList.add('is-invalid');
    allClientValidationPassed = false;
  } else {
    personalEmailInput.classList.remove('is-invalid');
  }

  if (!capturedImage.value) {
    faceError.textContent = 'Please capture your photo before submitting.';
    allClientValidationPassed = false;
  }

  // If any client-side validation failed, stop here
  if (!isFormValid || !isPasswordValid || !allClientValidationPassed) {
    e.stopPropagation(); // Prevent default submission if not valid
    signupForm.classList.add('was-validated'); // Show Bootstrap validation feedback
    showToast('Please correct the highlighted fields and capture your photo.', 'danger');
    return;
  }

  // Show loading state
  const submitBtn = document.getElementById('registerButton');
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Registering...';

  try {
    const formData = {
      fullName: fullNameInput.value.trim(),
      empId: empIdInput.value.trim(),
      email: emailInput.value.trim(),
      personalEmail: personalEmailInput.value.trim(),
      password: passwordInput.value,
      capturedImage: capturedImage.value
    };

    const response = await fetch('/employee_signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData)
    });

    const result = await response.json(); // Always parse JSON, even on errors

    if (response.ok) { // Check for 2xx status codes
      showToast('Registration successful! Redirecting to login...', 'success');
      signupForm.reset(); // Clear the form
      photoStatus.style.display = 'none'; // Hide photo status
      setTimeout(() => {
        window.location.href = '/employee_login';
      }, 2000);
    } else {
      // Handle server-side validation errors
      let errorMessage = result.message || 'Registration failed. Please try again.';
      showToast(errorMessage, 'danger');
      signupMessage.textContent = errorMessage;
      signupMessage.className = 'alert alert-danger mt-3 text-center';
      signupMessage.style.display = 'block';

      // Specific field error highlighting based on backend message
      if (result.message) {
        if (result.message.includes('Employee ID already exists')) {
          empIdError.textContent = result.message;
          empIdInput.classList.add('is-invalid');
        } else if (result.message.includes('Email already exists')) {
          emailError.textContent = result.message;
          emailInput.classList.add('is-invalid');
        } else if (result.message.includes('face is already registered') || result.message.includes('No face detected')) {
          faceError.textContent = result.message;
        }
        // For password complexity errors, passwordInput would already be marked
      }
    }
  } catch (error) {
    showToast('An error occurred during registration. Please check your network and try again.', 'danger');
    signupMessage.textContent = 'An error occurred during registration. Please try again.';
    signupMessage.className = 'alert alert-danger mt-3 text-center';
    signupMessage.style.display = 'block';
    console.error('Registration error:', error);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
  }
}

// Clear validation errors on input
function clearValidation(inputId, errorElement) {
  const input = document.getElementById(inputId);
  input.addEventListener('input', () => {
    input.classList.remove('is-invalid', 'is-valid'); // Also remove is-valid
    if (errorElement) {
      errorElement.textContent = '';
    }
    // Also clear general signup message if a field is being edited
    signupMessage.style.display = 'none';
  });
}

// Initialize the application
function init() {
  initCamera();

  // Password strength and validation
  passwordInput.addEventListener('input', validatePasswords);
  confirmPasswordInput.addEventListener('input', validatePasswords); // Listen to confirm input too

  // Password toggles
  setupPasswordToggle('password', 'togglePassword');
  setupPasswordToggle('confirmPassword', 'toggleConfirmPassword');

  // Capture button
  captureBtn.addEventListener('click', capturePhoto);

  // Form submission
  signupForm.addEventListener('submit', submitForm);

  // Clear validation for other fields
  clearValidation('fullName', null); // No specific error element for full name
  clearValidation('empId', empIdError);
  clearValidation('email', emailError);
  clearValidation('personalEmail', null); // No specific error element for personal email

  // Add an event listener to the email field to ensure it ends with @innovasolutions.com
  document.getElementById('email').addEventListener('input', function() {
    if (this.value.endsWith('@innovasolutions.com') && this.value.length > '@innovasolutions.com'.length) {
      this.classList.remove('is-invalid');
      this.classList.add('is-valid');
      emailError.textContent = '';
    } else {
      this.classList.remove('is-valid');
      this.classList.add('is-invalid');
      emailError.textContent = 'Company email must end with @innovasolutions.com';
    }
  });

  document.getElementById('personalEmail').addEventListener('input', function() {
    // Only validate if there's input
    if (this.value.trim()) {
        if (!/^[^\s@]+@[^\s@]+\.[^@]+$/.test(this.value.trim())) {
          this.classList.add('is-invalid');
          this.classList.remove('is-valid');
        } else {
          this.classList.remove('is-invalid');
          this.classList.add('is-valid');
        }
    } else {
        this.classList.remove('is-invalid', 'is-valid'); // Clear validation if empty
    }
  });

  // Initial validation check (useful if form state is persisted or reloaded)
  // This helps set initial state based on any pre-filled values
  validatePasswords();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);