
function showToast(type, message) {
  const toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    // Create toast container if it doesn't exist
    const container = document.createElement('div');
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '1100';
    document.body.appendChild(container);
  }

  const toastEl = document.createElement('div');
  // Use 'warning' type for orange color, 'info' for blue, etc.
  let bgClass;
  let textClass = 'text-white'; // Default for success/danger

  if (type === 'success') {
    bgClass = 'bg-success';
  } else if (type === 'error') {
    bgClass = 'bg-danger';
  } else if (type === 'warning') { // Added warning type
    bgClass = 'bg-warning';
    textClass = 'text-dark'; // Warning usually has dark text
  } else { // Default to primary/info
    bgClass = 'bg-primary';
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

// Form validation and submission
document.getElementById('employeeLoginForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const empIdInput = document.getElementById('empId');
  const passwordInput = document.getElementById('password');
  let isValid = true;
  
  // Reset validation feedback
  empIdInput.classList.remove('is-invalid');
  passwordInput.classList.remove('is-invalid');
  
  // Validate fields
  if (!empIdInput.value.trim()) {
    empIdInput.classList.add('is-invalid');
    isValid = false;
  }
  // Add min length validation for empId
  if (empIdInput.value.trim().length < 3) {
    empIdInput.classList.add('is-invalid');
    showToast('warning', 'Employee ID must be at least 3 characters long.');
    isValid = false;
  }
  
  if (!passwordInput.value.trim()) {
    passwordInput.classList.add('is-invalid');
    isValid = false;
  }
  
  if (!isValid) return; // Stop if client-side validation fails
  
  const loginButton = document.getElementById('loginButton');
  loginButton.disabled = true;
  loginButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Logging in...';
  
  try {
    const response = await fetch('/employee_login_auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        empId: empIdInput.value.trim(),
        password: passwordInput.value
      })
    });
    
    const result = await response.json();
    
    if (response.ok) { // Check for 2xx status codes from Flask
      // Handle "Remember me" functionality
      if (document.getElementById('rememberMe').checked) {
        localStorage.setItem('rememberedEmpId', empIdInput.value.trim());
      } else {
        localStorage.removeItem('rememberedEmpId');
      }
      
      showToast('success', result.message || 'Login successful!');
      setTimeout(() => {
        window.location.href = '/employee'; // Redirect to employee dashboard
      }, 500); // Short delay for toast to be seen
      
    } else {
      // Handle non-2xx responses (e.g., 400, 401, 404, 500)
      showToast('error', result.message || 'Login failed. Please try again.');
    }
  } catch (error) {
    showToast('error', 'Login failed. A network error occurred. Please try again.');
    console.error('Error:', error);
  } finally {
    loginButton.disabled = false;
    loginButton.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i>Login';
  }
});

// Password toggle functionality
document.getElementById('togglePassword').addEventListener('click', function() {
  const passwordInput = document.getElementById('password');
  const icon = this.querySelector('i');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    icon.classList.replace('bi-eye-fill', 'bi-eye-slash-fill');
  } else {
    passwordInput.type = 'password';
    icon.classList.replace('bi-eye-slash-fill', 'bi-eye-fill');
  }
});

// Forgot password link click handler
document.getElementById('forgotPasswordLink').addEventListener('click', function(e) {
  e.preventDefault();
  const modal = new bootstrap.Modal(document.getElementById('forgotPasswordModal'));
  modal.show();
  
  // Reset modal state when shown
  document.getElementById('step1').style.display = 'block';
  document.getElementById('step2').style.display = 'none';
  document.getElementById('step3').style.display = 'none';
  
  // Clear form inputs
  document.getElementById('forgotPasswordForm').reset();
  document.getElementById('verifyCodeForm').reset();
  document.getElementById('resetPasswordForm').reset();
  
  // Pre-fill employee ID if available from login form
  const empIdFromLogin = document.getElementById('empId').value.trim();
  if (empIdFromLogin) {
    document.getElementById('forgotEmpId').value = empIdFromLogin;
  }
  // Reset button states
  resetModalButtons();
});

// Handle modal close event - this event fires when the modal is fully hidden
document.getElementById('forgotPasswordModal').addEventListener('hidden.bs.modal', function() {
  // Reset modal state when closed (e.g., via X button or esc key)
  document.getElementById('step1').style.display = 'block';
  document.getElementById('step2').style.display = 'none';
  document.getElementById('step3').style.display = 'none';
  
  // Clear form inputs
  document.getElementById('forgotPasswordForm').reset();
  document.getElementById('verifyCodeForm').reset();
  document.getElementById('resetPasswordForm').reset();
  
  // Reset all buttons to their original state
  resetModalButtons();
});

function resetModalButtons() {
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) {
        modal.querySelectorAll('button[type="submit"]').forEach(button => {
            button.disabled = false;
            button.innerHTML = button.dataset.originalText || 'Continue'; // Use dataset or default
        });
        const resendLink = modal.querySelector('#resendCode');
        if (resendLink) {
            resendLink.innerHTML = 'Resend Code';
            resendLink.style.pointerEvents = 'auto';
        }
    }
}

// Forgot password form submission (Step 1: Request OTP)
document.getElementById('forgotPasswordForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const submitButton = this.querySelector('button[type="submit"]');
  submitButton.dataset.originalText = submitButton.innerHTML; // Store original text
  
  const empIdInput = document.getElementById('forgotEmpId');
  const personalEmailInput = document.getElementById('personalEmail');
  
  const empId = empIdInput.value.trim();
  const personalEmail = personalEmailInput.value.trim();

  // Basic client-side validation for Step 1
  if (!empId) {
    empIdInput.classList.add('is-invalid');
    showToast('error', 'Please enter your Employee ID.');
    return;
  } else if (empId.length < 3) { // Align with backend min length
    empIdInput.classList.add('is-invalid');
    showToast('warning', 'Employee ID must be at least 3 characters long.');
    return;
  } else {
    empIdInput.classList.remove('is-invalid');
  }

  if (!personalEmail) {
    personalEmailInput.classList.add('is-invalid');
    showToast('error', 'Please enter your Personal Email.');
    return;
  } else if (!/^[^\s@]+@[^\s@]+\.[^@]+$/.test(personalEmail)) {
    personalEmailInput.classList.add('is-invalid');
    showToast('warning', 'Please enter a valid personal email address.');
    return;
  } else {
    personalEmailInput.classList.remove('is-invalid');
  }

  submitButton.disabled = true;
  submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Sending...';
  
  try {
    const response = await fetch('/forgot_password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        empId: empId,
        personalEmail: personalEmail
      })
    });
    
    const result = await response.json();
    
    if (response.ok) { // Check for 2xx status codes
      // Move to step 2 (verification code)
      document.getElementById('step1').style.display = 'none';
      document.getElementById('step2').style.display = 'block';
      showToast('success', result.message || 'Verification code sent to your email.');
    } else {
      // Handle non-2xx responses (e.g., 400, 404, 500)
      showToast('error', result.message || 'Failed to initiate password reset. Please check your credentials.');
    }
  } catch (error) {
    showToast('error', 'An error occurred. Please try again.');
    console.error('Error:', error);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = submitButton.dataset.originalText;
  }
});

// Verification code submission (Step 2: Verify OTP)
document.getElementById('verifyCodeForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const submitButton = this.querySelector('button[type="submit"]');
  submitButton.dataset.originalText = submitButton.innerHTML;
  
  const empId = document.getElementById('forgotEmpId').value.trim(); // Get Employee ID from Step 1's input
  const codeInput = document.getElementById('verificationCode');
  const code = codeInput.value.trim();
  
  if (!code) {
    codeInput.classList.add('is-invalid');
    showToast('error', 'Please enter the verification code.');
    return;
  } else {
    codeInput.classList.remove('is-invalid');
  }

  submitButton.disabled = true;
  submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Verifying...';
  
  try {
    const response = await fetch('/verify_reset_code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        empId: empId,
        code: code
      })
    });
    
    const result = await response.json();
    
    if (response.ok) { // Check for 2xx status codes
      // Move to step 3 (new password)
      document.getElementById('step2').style.display = 'none';
      document.getElementById('step3').style.display = 'block';
      showToast('success', result.message || 'Code verified successfully.');
    } else {
      // Handle non-2xx responses
      showToast('error', result.message || 'Invalid verification code.');
      codeInput.classList.add('is-invalid'); // Mark input as invalid on backend failure
    }
  } catch (error) {
    showToast('error', 'An error occurred. Please try again.');
    console.error('Error:', error);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = submitButton.dataset.originalText;
  }
});

// Resend code handler
document.getElementById('resendCode').addEventListener('click', async function(e) {
  e.preventDefault();
  
  const resendLink = this;
  resendLink.dataset.originalText = resendLink.innerHTML;
  
  const empId = document.getElementById('forgotEmpId').value.trim();
  const personalEmail = document.getElementById('personalEmail').value.trim();
  
  // Basic validation before resending
  if (!empId || !personalEmail || empId.length < 3 || !/^[^\s@]+@[^\s@]+\.[^@]+$/.test(personalEmail)) {
    showToast('error', 'Please ensure Employee ID and a valid Personal Email are entered in the first step.');
    return;
  }
  
  resendLink.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Sending...';
  resendLink.style.pointerEvents = 'none'; // Disable link during sending

  try {
    const response = await fetch('/forgot_password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        empId: empId,
        personalEmail: personalEmail
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showToast('success', result.message || 'New verification code sent.');
    } else {
      showToast('error', result.message || 'Failed to resend code.');
    }
  } catch (error) {
    showToast('error', 'An error occurred. Please try again.');
    console.error('Error:', error);
  } finally {
    resendLink.innerHTML = resendLink.dataset.originalText;
    resendLink.style.pointerEvents = 'auto'; // Re-enable link
  }
});

// Password reset handler (Step 3: Set New Password)
document.getElementById('resetPasswordForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const submitButton = this.querySelector('button[type="submit"]');
  submitButton.dataset.originalText = submitButton.innerHTML;
  
  const empId = document.getElementById('forgotEmpId').value.trim(); // Get Employee ID from Step 1's input
  const newPasswordInput = document.getElementById('newPassword');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  
  // Client-side validation for Step 3
  if (!newPassword || !confirmPassword) {
    if (!newPassword) newPasswordInput.classList.add('is-invalid');
    if (!confirmPassword) confirmPasswordInput.classList.add('is-invalid');
    showToast('error', 'Please fill in all password fields.');
    return;
  } else {
    newPasswordInput.classList.remove('is-invalid');
    confirmPasswordInput.classList.remove('is-invalid');
  }

  if (newPassword !== confirmPassword) {
    newPasswordInput.classList.add('is-invalid');
    confirmPasswordInput.classList.add('is-invalid');
    showToast('error', 'New passwords do not match.');
    return;
  }

  // Client-side password complexity check
  const passwordRegex = /^(?=.*\d)(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!passwordRegex.test(newPassword)) {
      newPasswordInput.classList.add('is-invalid');
      showToast('warning', 'New password must be at least 8 characters, contain at least one uppercase letter, one number, and one special character.');
      return;
  }

  submitButton.disabled = true;
  submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Resetting...';
  
  try {
    const response = await fetch('/reset_password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        empId: empId,
        newPassword: newPassword
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showToast('success', result.message || 'Password reset successfully.');
      // Close the modal
      const modal = bootstrap.Modal.getInstance(document.getElementById('forgotPasswordModal'));
      if (modal) modal.hide(); // Hide the modal if it's open
      
      // Redirect to login page after a short delay
      setTimeout(() => {
        window.location.href = '/employee_login';
      }, 1500);
    } else {
      showToast('error', result.message || 'Failed to reset password.');
    }
  } catch (error) {
    showToast('error', 'An error occurred. Please try again.');
    console.error('Error:', error);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = submitButton.dataset.originalText;
  }
});

// Check for remembered employee ID on page load
document.addEventListener('DOMContentLoaded', function() {
  const rememberedEmpId = localStorage.getItem('rememberedEmpId');
  if (rememberedEmpId) {
    document.getElementById('empId').value = rememberedEmpId;
    document.getElementById('rememberMe').checked = true;
  }
});