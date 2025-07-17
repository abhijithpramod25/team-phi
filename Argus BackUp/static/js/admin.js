
function showToast(type, message) {
  const toastContainer = document.querySelector('.toast-container');
  // Create toast container if it doesn't exist (it should, but for robustness)
  if (!toastContainer) {
    const container = document.createElement('div');
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '1100';
    document.body.appendChild(container);
  }

  const toastEl = document.createElement('div');
  // Determine Bootstrap background class based on type
  let bgClass = '';
  let textClass = 'text-white'; // Default text color for dark backgrounds
  if (type === 'success') {
    bgClass = 'bg-success';
  } else if (type === 'error') {
    bgClass = 'bg-danger';
  } else if (type === 'warning') {
    bgClass = 'bg-warning';
    textClass = 'text-dark'; // Warning often has dark text
  } else {
    bgClass = 'bg-primary'; // Default for info/other
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
  }, 5000);
}

class AdminAuth {
  constructor() {
    this.initElements();
    this.initEvents();
    this.checkRememberedAdminId(); // Check for remembered ID on load
  }

  initElements() {
    this.form = document.getElementById('adminLoginForm');
    this.adminIdInput = document.getElementById('adminid');
    this.passwordInput = document.getElementById('adminpass');
    this.submitButton = this.form.querySelector('button[type="submit"]');
    this.loadingOverlay = document.getElementById('loadingOverlay');
    this.togglePasswordBtn = document.getElementById('togglePassword');
    this.rememberMeCheckbox = document.getElementById('rememberMe');
  }

  initEvents() {
    this.form.addEventListener('submit', this.handleSubmit.bind(this));
    this.togglePasswordBtn.addEventListener('click', this.togglePasswordVisibility.bind(this));
    
    this.adminIdInput.addEventListener('blur', this.validateAdminId.bind(this));
    this.passwordInput.addEventListener('blur', this.validatePassword.bind(this));
  }

  togglePasswordVisibility() {
    const icon = this.togglePasswordBtn.querySelector('i');
    if (this.passwordInput.type === 'password') {
      this.passwordInput.type = 'text';
      icon.classList.replace('bi-eye-fill', 'bi-eye-slash-fill');
    } else {
      this.passwordInput.type = 'password';
      icon.classList.replace('bi-eye-slash-fill', 'bi-eye-fill');
    }
  }

  validateAdminId() {
    const value = this.adminIdInput.value.trim();
    // Min length for Admin ID - align with backend
    const isValid = value.length >= 3; 
    this.adminIdInput.classList.toggle('is-invalid', !isValid);
    if (!isValid) {
        this.adminIdInput.setCustomValidity(`Admin ID must be at least 3 characters.`);
    } else {
        this.adminIdInput.setCustomValidity('');
    }
    return isValid;
  }

  validatePassword() {
    const value = this.passwordInput.value.trim();
    // Min length for Admin password - align with backend
    const isValid = value.length >= 8; 
    this.passwordInput.classList.toggle('is-invalid', !isValid);
    if (!isValid) {
        this.passwordInput.setCustomValidity(`Password must be at least 8 characters.`);
    } else {
        this.passwordInput.setCustomValidity('');
    }
    return isValid;
  }

 async handleSubmit(e) {
    e.preventDefault();
    
    // Perform all validations
    const isIdValid = this.validateAdminId();
    const isPasswordValid = this.validatePassword();

    if (!isIdValid || !isPasswordValid) {
        // Only shake and show toast if client-side validation fails
        this.shakeForm();
        showToast('error', 'Please ensure all fields are filled correctly.');
        return;
    }
    
    this.showLoading();

    // Handle "Remember me" functionality
    if (this.rememberMeCheckbox && this.rememberMeCheckbox.checked) {
      localStorage.setItem('rememberedAdminId', this.adminIdInput.value.trim());
    } else {
      localStorage.removeItem('rememberedAdminId');
    }
    
    // Submit the form normally. Backend will handle the actual authentication.
    // The Flask route directly renders the template with error if auth fails,
    // so no need for fetch here unless you convert it to an API endpoint returning JSON.
    // Given the current Flask structure, direct form submission is appropriate.
    this.form.submit();
}

  showLoading() {
    this.loadingOverlay.style.display = 'flex';
    this.submitButton.disabled = true;
    this.submitButton.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      Authenticating...
    `;
  }

  hideLoading() {
    this.loadingOverlay.style.display = 'none';
    this.submitButton.disabled = false;
    this.submitButton.innerHTML = `
      <i class="bi bi-box-arrow-in-right me-2"></i>Login
    `;
  }

  shakeForm() {
    const form = this.form;
    form.classList.add('animate__animated', 'animate__shakeX');
    // Remove the class after animation to allow it to be re-added
    form.addEventListener('animationend', () => {
        form.classList.remove('animate__animated', 'animate__shakeX');
    }, { once: true });
  }

  // Check for remembered admin ID on page load
  checkRememberedAdminId() {
    const rememberedAdminId = localStorage.getItem('rememberedAdminId');
    if (rememberedAdminId) {
      this.adminIdInput.value = rememberedAdminId;
      if (this.rememberMeCheckbox) {
        this.rememberMeCheckbox.checked = true;
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('adminLoginForm')) {
    new AdminAuth();
  }
  
  // Service Worker registration (already present in HTML, moved here for consistency)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('ServiceWorker registration successful with scope: ', registration.scope);
        })
        .catch(err => {
          console.error('ServiceWorker registration failed: ', err);
        });
    });
  }
});