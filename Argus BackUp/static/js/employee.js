
document.addEventListener('DOMContentLoaded', function() {
    try {
        initRefreshButton();
        initPasswordChange();
        initPasswordVisibilityToggle();
        initProfileEdit(); // Initialize profile edit functionality
        initSidebarToggle(); // Initialize sidebar toggle

    } catch (error) {
        console.error('Initialization error:', error);
        showToast('Failed to initialize page features', 'danger');
    }
});

function initPasswordVisibilityToggle() {
    document.querySelectorAll('.toggle-password').forEach(button => {
        button.addEventListener('click', function() {
            const input = this.previousElementSibling;
            const icon = this.querySelector('i');

            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('bi-eye');
                icon.classList.add('bi-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('bi-eye-slash');
                icon.classList.add('bi-eye');
            }
        });
    });
}

function initRefreshButton() {
    const refreshBtn = document.getElementById('refreshActivity');
    if (!refreshBtn) return;

    refreshBtn.addEventListener('click', function() {
        window.location.reload();
    });
}

// Attendance tracking functionality remains the same - no client-side logic to initialize here specifically.

function initPasswordChange() {
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (!changePasswordForm) return;

    changePasswordForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (newPassword !== confirmPassword) {
            showToast('New password and confirm password do not match', 'warning');
            return;
        }

        // Client-side password complexity check
        const passwordRegex = /^(?=.*\d)(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            showToast('New password must be at least 8 characters, contain at least one uppercase letter, one number, and one special character.', 'warning');
            return;
        }

        try {
            showLoadingSpinner();
            const response = await fetch('/update_password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword,
                    confirm_password: confirmPassword
                })
            });

            const result = await response.json();
            hideLoadingSpinner();

            if (response.ok) { // Check response.ok for 2xx status codes
                showToast(result.message || 'Password changed successfully', 'success');
                changePasswordForm.reset();

                const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
                if (modal) modal.hide();
            } else {
                showToast(result.message || 'Failed to change password.', 'danger');
            }
        } catch (error) {
            hideLoadingSpinner();
            console.error('Password change error:', error);
            showToast('An error occurred during password change. Please try again.', 'danger');
        }
    });
}

// Initialize profile edit functionality
function initProfileEdit() {
    const saveProfileBtn = document.getElementById('saveProfileChanges');
    const profilePersonalEmailInput = document.getElementById('profilePersonalEmail');

    if (saveProfileBtn && profilePersonalEmailInput) {
        // Add event listener for input validation
        profilePersonalEmailInput.addEventListener('input', function() {
            if (this.value && !/^[^\s@]+@[^\s@]+\.[^@]+$/.test(this.value)) {
                this.classList.add('is-invalid');
            } else {
                this.classList.remove('is-invalid');
            }
        });

        saveProfileBtn.addEventListener('click', async function() {
            const newPersonalEmail = profilePersonalEmailInput.value.trim();

            // Client-side email format validation
            if (newPersonalEmail && !/^[^\s@]+@[^\s@]+\.[^@]+$/.test(newPersonalEmail)) {
                showToast('Please enter a valid personal email address.', 'warning');
                return;
            }

            saveProfileBtn.disabled = true;
            saveProfileBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving...';

            try {
                const response = await fetch('/employee/api/profile', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ personal_email: newPersonalEmail })
                });

                const result = await response.json();

                if (response.ok) { // Check response.ok for 2xx status codes
                    showToast(result.message || 'Profile updated successfully!', 'success');
                    const profileModal = bootstrap.Modal.getInstance(document.getElementById('profileModal'));
                    if (profileModal) {
                        profileModal.hide();
                    }
                    // Reload the page to reflect all changes, including the username in navbar if it was ever linked to personal email
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    showToast(result.message || 'Failed to update profile.', 'danger');
                }
            } catch (error) {
                console.error('Error updating profile:', error);
                showToast('An error occurred while updating profile.', 'danger');
            } finally {
                saveProfileBtn.disabled = false;
                saveProfileBtn.innerHTML = 'Save Changes';
            }
        });
    }
}

// Sidebar toggle for employee dashboard
function initSidebarToggle() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.sidebar');
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('show');
            document.body.classList.toggle('sidebar-open');
        });

        document.addEventListener('click', function(event) {
            if (sidebar.classList.contains('show') && !sidebar.contains(event.target) && !sidebarToggle.contains(event.target)) {
                sidebar.classList.remove('show');
                document.body.classList.remove('sidebar-open');
            }
        });
    }
}


function showLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.style.display = 'flex';
}

function hideLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.style.display = 'none';
}

function showToast(message, type = 'success') {
    if (typeof bootstrap === 'undefined' || !bootstrap.Toast) {
        console.error('Bootstrap Toast not available');
        alert(message); // Fallback to alert
        return;
    }

    const toastContainer = document.getElementById('toastContainer') || createToastContainer();
    const toastId = 'toast-' + Date.now();
    const toastHTML = `
        <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body"></div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    const toastElement = document.getElementById(toastId);
    const toastBody = toastElement.querySelector('.toast-body');
    toastBody.textContent = message;

    // Adjust text color based on toast type
    if (type === 'warning' || type === 'info') {
        toastBody.classList.remove('text-white');
        toastBody.classList.add('text-dark');
    } else {
        toastBody.classList.remove('text-dark');
        toastBody.classList.add('text-white');
    }

    const toast = new bootstrap.Toast(toastElement, {
        autohide: true,
        delay: 5000
    });
    toast.show();

    toastElement.addEventListener('hidden.bs.toast', function() {
        toastElement.remove();
    });
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '1100';
    document.body.appendChild(container);
    return container;
}