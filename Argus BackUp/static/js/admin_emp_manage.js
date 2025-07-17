// Toast notification function
function showToast(title, message, type = 'success') {
  const toastEl = document.getElementById('liveToast');
  const toastTitle = document.getElementById('toastTitle');
  const toastMessage = document.getElementById('toastMessage');

  // Set title and message
  toastTitle.textContent = title;
  toastMessage.textContent = message;

  // Set color based on type
  const toast = new bootstrap.Toast(toastEl);
  const header = toastEl.querySelector('.toast-header');

  // Reset classes first
  header.classList.remove('bg-success', 'bg-danger', 'bg-primary', 'text-white', 'bg-warning', 'text-dark');
  toastEl.classList.remove('bg-success', 'bg-danger', 'bg-primary', 'text-white', 'bg-warning', 'text-dark', 'bg-info'); // Added bg-info
  toastMessage.classList.remove('text-white', 'text-dark'); // Clear text color from body

  if (type === 'error') {
    header.classList.add('bg-danger', 'text-white');
    toastEl.classList.add('bg-danger');
    toastMessage.classList.add('text-white');
  } else if (type === 'success') {
    header.classList.add('bg-success', 'text-white');
    toastEl.classList.add('bg-success');
    toastMessage.classList.add('text-white');
  } else if (type === 'warning') {
    header.classList.add('bg-warning', 'text-dark');
    toastEl.classList.add('bg-warning');
    toastMessage.classList.add('text-dark');
  } else if (type === 'info') { // Added info type
    header.classList.add('bg-info', 'text-white'); // Assuming info toast has a darker info background
    toastEl.classList.add('bg-info');
    toastMessage.classList.add('text-white');
  }
  else {
    header.classList.add('bg-primary', 'text-white');
    toastEl.classList.add('bg-primary');
    toastMessage.classList.add('text-white');
  }

  toast.show();
}

let allEmployees = []; // To store all employees fetched from the server

document.addEventListener('DOMContentLoaded', function() {
  // Sidebar toggle functionality
  document.getElementById('sidebarToggle')?.addEventListener('click', function() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('show');
    document.body.classList.toggle('sidebar-open');
  });

  // Close sidebar when clicking outside
  document.addEventListener('click', function(event) {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebar?.classList.contains('show') && !sidebar.contains(event.target) && !sidebarToggle?.contains(event.target)) {
      sidebar.classList.remove('show');
      document.body.classList.remove('sidebar-open');
    }
  });

  // Fetch and display employees on page load
  fetchEmployees();

  // Export functionality
  document.getElementById('exportEmployeesExcel')?.addEventListener('click', function(e) {
    e.preventDefault();
    exportEmployees('xlsx');
  });

  document.getElementById('exportEmployeesCSV')?.addEventListener('click', function(e) {
    e.preventDefault();
    exportEmployees('csv');
  });

  function exportEmployees(format) {
    const params = new URLSearchParams(window.location.search);
    params.set('format', format);
    window.location.href = '/admin/export_employees?' + params.toString();
  }

  // Photo preview for Add Employee modal (now part of bulk add rows)
  // This event listener will need to be dynamically attached/handled for each new row
  document.addEventListener('change', function(event) {
    if (event.target.classList.contains('employee-photo-input')) {
      const file = event.target.files[0];
      const photoPreview = event.target.closest('td').querySelector('.photo-preview');
      if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
          photoPreview.src = e.target.result;
          photoPreview.style.display = 'block';
        }
        reader.readAsDataURL(file);
      } else {
        photoPreview.style.display = 'none';
      }
    }
  });

  // Filter change handlers
  document.getElementById('searchQuery')?.addEventListener('keyup', filterAndDisplayEmployees);
  document.getElementById('departmentFilter')?.addEventListener('change', filterAndDisplayEmployees);

  // Reset Filters button
  document.getElementById('resetFilters')?.addEventListener('click', function() {
    document.getElementById('searchQuery').value = '';
    document.getElementById('departmentFilter').value = '';
    filterAndDisplayEmployees();
  });

  // Generate random password
  function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    // Ensure at least one of each required character type
    password += 'A'; // Uppercase
    password += 'a'; // Lowercase (already in chars)
    password += '1'; // Number
    password += '!'; // Special character

    for (let i = 0; i < 8; i++) { // Generate remaining 8 characters to meet 12 total (4 already added)
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Shuffle the password to randomize the order
    password = password.split('').sort(() => 0.5 - Math.random()).join('');
    return password;
  }

  // Delegated event for password generation buttons in bulk add modal
  document.addEventListener('click', function(event) {
    if (event.target.closest('.password-generate-btn') || event.target.closest('.password-generate-inline')) {
      const button = event.target.closest('.password-generate-btn') || event.target.closest('.password-generate-inline');
      const input = button.closest('.input-group').querySelector('.password-input') || button.closest('.input-group').querySelector('.edit-password');
      if (input) {
        input.value = generatePassword();
      }
    }
  });

  // Add Row functionality for Bulk Add Modal
  document.getElementById('addRowBtn')?.addEventListener('click', addRow);

  // Remove Selected Rows functionality for Bulk Add Modal
  document.getElementById('removeSelectedAddRowsBtn')?.addEventListener('click', removeSelectedAddRows);

  // Event delegation for checkboxes in bulk add table
  document.getElementById('bulkAddTableBody')?.addEventListener('change', function(event) {
    if (event.target.classList.contains('add-row-checkbox')) {
      updateRemoveSelectedAddRowsButton();
    }
  });

  function updateRemoveSelectedAddRowsButton() {
    const checkboxes = document.querySelectorAll('#bulkAddTableBody .add-row-checkbox:checked');
    document.getElementById('removeSelectedAddRowsBtn').disabled = checkboxes.length === 0;
  }

  let rowCounter = 0;
  function addRow() {
    rowCounter++;
    const tableBody = document.getElementById('bulkAddTableBody');
    const newRow = `
      <tr>
        <td><input type="checkbox" class="form-check-input add-row-checkbox"></td>
        <td><input type="text" class="form-control form-control-sm full-name-input" placeholder="Full Name" required></td>
        <td><input type="text" class="form-control form-control-sm employee-id-input" placeholder="EMP001" pattern="[A-Za-z0-9]{3,}" title="Employee ID must be at least 3 alphanumeric characters" required></td>
        <td>
          <div class="input-group input-group-sm">
            <input type="text" class="form-control form-control-sm email-prefix-input" placeholder="username" required>
            <span class="input-group-text">@innovasolutions.com</span>
          </div>
        </td>
        <td><input type="email" class="form-control form-control-sm personal-email-input" placeholder="personal@example.com" pattern="[^\\s@]+@[^\\s@]+\\.[^@]+" title="Please enter a valid email address"></td>
        <td>
          <select class="form-select form-select-sm department-input" required>
            <option value="">Select Dept</option>
            <option value="Engineering">Engineering</option>
            <option value="Data Science">Data Science</option>
            <option value="Marketing">Marketing</option>
            <option value="HR">Human Resources</option>
            <option value="Finance">Finance</option>
            <option value="Operations">Operations</option>
            <option value="Not assigned">Not assigned</option>
          </select>
        </td>
        <td><input type="text" class="form-control form-control-sm position-input" placeholder="Position" required></td>
        <td>
          <div class="input-group input-group-sm">
            <input type="text" class="form-control form-control-sm password-input" value="${generatePassword()}" pattern="(?=.*\\d)(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}" title="Password must be at least 8 characters, contain at least one uppercase letter, one number, and one special character" required>
            <button class="btn btn-outline-secondary btn-sm password-generate-btn" type="button">
              <i class="bi bi-arrow-repeat"></i>
            </button>
          </div>
        </td>
        <td>
          <input type="file" class="form-control form-control-sm employee-photo-input" accept="image/*" capture="environment" required>
          <img src="#" alt="Preview" class="photo-preview mt-1" style="max-width: 80px; display: none;">
        </td>
        <td>
          <button type="button" class="btn btn-danger btn-sm remove-row-btn" title="Remove Row">
            <i class="bi bi-x-lg"></i>
          </button>
        </td>
      </tr>
    `;
    tableBody.insertAdjacentHTML('beforeend', newRow);
    // Ensure Bootstrap's form validation is reapplied to new elements
    const newRowElement = tableBody.lastElementChild;
    newRowElement.querySelectorAll('input, select').forEach(element => {
        element.addEventListener('input', () => {
            if (element.checkValidity()) {
                element.classList.remove('is-invalid');
                element.classList.add('is-valid');
            } else {
                element.classList.remove('is-valid');
                element.classList.add('is-invalid');
            }
        });
    });
  }

  function removeSelectedAddRows() {
    document.querySelectorAll('#bulkAddTableBody .add-row-checkbox:checked').forEach(checkbox => {
      checkbox.closest('tr').remove();
    });
    updateRemoveSelectedAddRowsButton();
  }

  // Delegated event for remove row buttons in bulk add modal
  document.getElementById('bulkAddTableBody')?.addEventListener('click', function(event) {
    if (event.target.closest('.remove-row-btn')) {
      event.target.closest('tr').remove();
      updateRemoveSelectedAddRowsButton();
    }
  });

  // Handle Bulk Add Employees submission
  document.getElementById('addBulkEmployeesBtn')?.addEventListener('click', async function() {
    const employeesData = [];
    let allValid = true;

    const rows = document.querySelectorAll('#bulkAddTableBody tr');
    if (rows.length === 0) {
      showToast('Warning', 'Please add at least one employee row.', 'warning');
      return;
    }

    for (const row of rows) {
      const fullNameInput = row.querySelector('.full-name-input');
      const employeeIdInput = row.querySelector('.employee-id-input');
      const emailPrefixInput = row.querySelector('.email-prefix-input');
      const personalEmailInput = row.querySelector('.personal-email-input');
      const departmentInput = row.querySelector('.department-input');
      const positionInput = row.querySelector('.position-input');
      const passwordInput = row.querySelector('.password-input');
      const photoInput = row.querySelector('.employee-photo-input');

      // Manual validation for required fields
      if (!fullNameInput.value.trim() || !employeeIdInput.value.trim() || !emailPrefixInput.value.trim() ||
          !departmentInput.value || !positionInput.value.trim() || !passwordInput.value.trim()) {
        showToast('Error', 'Please fill all required text/select fields for each employee.', 'error');
        allValid = false;
        break;
      }

      if (!photoInput.files || photoInput.files.length === 0) {
          showToast('Error', 'Please upload a photo for each employee.', 'error');
          allValid = false;
          break;
      }

      // Validate email formats
      const companyEmail = `${emailPrefixInput.value.trim()}@innovasolutions.com`;
      if (!companyEmail.endsWith('@innovasolutions.com')) {
        showToast('Error', 'Company email must end with @innovasolutions.com for all entries.', 'error');
        allValid = false;
        break;
      }
      if (personalEmailInput.value.trim() && !/^[^\s@]+@[^\s@]+\.[^@]+$/.test(personalEmailInput.value.trim())) {
        showToast('Error', 'Please enter a valid personal email for all entries.', 'error');
        allValid = false;
        break;
      }

      // Password complexity check
      const passwordValue = passwordInput.value;
      const passwordRegex = /^(?=.*\d)(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;
      if (!passwordRegex.test(passwordValue)) {
          showToast('Error', 'Passwords must be at least 8 characters, contain at least one uppercase letter, one number, and one special character for all entries.', 'error');
          allValid = false;
          break;
      }

      const reader = new FileReader();
      const promise = new Promise((resolve) => {
        reader.onload = function(e) {
          employeesData.push({
            fullName: fullNameInput.value.trim(),
            employeeId: employeeIdInput.value.trim(),
            email: companyEmail, // Use the constructed company email
            personalEmail: personalEmailInput.value.trim(),
            department: departmentInput.value,
            position: positionInput.value.trim(),
            password: passwordInput.value,
            photoData: e.target.result.split(',')[1] // Base64 part
          });
          resolve();
        };
        reader.readAsDataURL(photoInput.files[0]);
      });
      await promise; // Wait for each file to be read
    }

    if (!allValid) {
      return; // Stop submission if any row is invalid
    }

    const addBtn = this;
    const originalBtnText = addBtn.innerHTML;
    addBtn.disabled = true;
    addBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...';

    try {
      const response = await fetch('/admin/api/bulk_import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(employeesData)
      });

      const result = await response.json();

      if (response.ok) {
        showToast('Success', result.message || `Bulk import complete. Successful: ${result.successful}, Failed: ${result.failed}`, 'success');
        const bulkAddModal = bootstrap.Modal.getInstance(document.getElementById('bulkAddEmployeeModal'));
        if (bulkAddModal) bulkAddModal.hide();
        document.getElementById('bulkAddTableBody').innerHTML = ''; // Clear table
        addRow(); // Add one empty row back
        fetchEmployees(); // Refresh employee list
      } else {
        showToast('Error', 'Bulk import failed: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('Error adding employees:', error);
      showToast('Error', 'An error occurred while adding employees. Please check console.', 'error');
    } finally {
      addBtn.disabled = false;
      addBtn.innerHTML = originalBtnText;
    }
  });

  // Initial row for bulk add modal
  addRow();

  // Handle Edit Employee Inline Form opening and data loading
  document.getElementById('employeesTableBody')?.addEventListener('click', async function(event) {
    const editButton = event.target.closest('.edit-employee-btn');
    if (editButton) {
      const empId = editButton.dataset.empId;
      const inlineEditRow = document.getElementById(`edit-row-${empId}`);

      if (inlineEditRow && inlineEditRow.style.display === 'table-row') {
          // If already open, close it
          inlineEditRow.style.display = 'none';
          editButton.querySelector('i').classList.replace('bi-x-lg', 'bi-pencil'); // Change icon back to pencil
      } else {
          // Close any other open inline edit forms first
          document.querySelectorAll('.inline-edit-row').forEach(row => {
              if (row.style.display === 'table-row') {
                  row.style.display = 'none';
                  const otherEditButton = document.querySelector(`.edit-employee-btn[data-emp-id="${row.dataset.originalEmpId || row.querySelector('.edit-emp-id-original')?.value}"] i`);
                  if (otherEditButton) otherEditButton.classList.replace('bi-x-lg', 'bi-pencil');
              }
          });

          // Open this one
          if (inlineEditRow) {
            inlineEditRow.style.display = 'table-row';
            editButton.querySelector('i').classList.replace('bi-pencil', 'bi-x-lg'); // Change icon to X
          }

          try {
            const response = await fetch(`/admin/api/employees/${empId}`);
            const data = await response.json();

            if (response.ok) {
              // Populate the inline form fields
              if (inlineEditRow) {
                inlineEditRow.querySelector('.edit-full-name').value = data.full_name;
                inlineEditRow.querySelector('.edit-employee-id').value = data.emp_id;
                inlineEditRow.querySelector('.edit-email').value = data.email;
                inlineEditRow.querySelector('.edit-personal-email').value = data.personal_email;
                inlineEditRow.querySelector('.edit-department').value = data.department;
                inlineEditRow.querySelector('.edit-position').value = data.position;
                inlineEditRow.querySelector('.edit-password').value = ''; // Clear password field
                inlineEditRow.dataset.originalEmpId = empId; // Store original empId on the row for update
              }

            } else {
              showToast('Error', 'Error fetching employee data: ' + (data.error || 'Unknown error'), 'error');
              if (inlineEditRow) inlineEditRow.style.display = 'none'; // Hide if data fetch fails
              editButton.querySelector('i').classList.replace('bi-x-lg', 'bi-pencil');
            }
          } catch (error) {
            console.error('Error fetching employee data:', error);
            showToast('Error', 'An error occurred while fetching employee data', 'error');
            if (inlineEditRow) inlineEditRow.style.display = 'none'; // Hide if network error
            editButton.querySelector('i').classList.replace('bi-x-lg', 'bi-pencil');
          }
      }
    }
  });

  // Handle Edit Employee Inline Form Submission
  document.getElementById('employeesTableBody')?.addEventListener('click', async function(event) {
    const updateButton = event.target.closest('.update-employee-inline');
    if (updateButton) {
        const inlineEditRow = updateButton.closest('.inline-edit-row');
        const empId = inlineEditRow.dataset.originalEmpId; // Get original empId from the row

        const fullName = inlineEditRow.querySelector('.edit-full-name').value.trim();
        const personalEmail = inlineEditRow.querySelector('.edit-personal-email').value.trim();
        const department = inlineEditRow.querySelector('.edit-department').value.trim();
        const position = inlineEditRow.querySelector('.edit-position').value.trim();
        const password = inlineEditRow.querySelector('.edit-password').value; // Don't trim password

        // Frontend validation
        if (!fullName || !department || !position) {
          showToast('Error', 'Full Name, Department, and Position are required fields.', 'error');
          return;
        }

        if (personalEmail && !/^[^\s@]+@[^\s@]+\.[^@]+$/.test(personalEmail)) {
          showToast('Error', 'Please enter a valid personal email address.', 'error');
          return;
        }

        if (password) {
            const passwordRegex = /^(?=.*\d)(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;
            if (!passwordRegex.test(password)) {
                showToast('Error', 'New password must be at least 8 characters, contain at least one uppercase letter, one number, and one special character.', 'error');
                return;
            }
        }

        const updateData = {
          fullName: fullName,
          personalEmail: personalEmail,
          department: department,
          position: position
        };

        if (password) { // Only add password if it's not empty
          updateData.password = password;
        }

        const originalEmployeeResponse = await fetch(`/admin/api/employees/${empId}`);
        const originalEmployeeData = await originalEmployeeResponse.json();

        const updateBtn = this;
        const originalBtnText = updateBtn.innerHTML;
        updateBtn.disabled = true;
        updateBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Updating...';

        try {
          const response = await fetch(`/admin/api/employees/${empId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
          });

          const result = await response.json();

          if (response.ok) {
            showToast('Success', result.message || 'Employee updated successfully!', 'success');

            // Prepare email for changes
            const changes = {};
            if (fullName !== originalEmployeeData.full_name) changes.fullName = fullName;
            if (department !== originalEmployeeData.department) changes.department = department;
            if (position !== originalEmployeeData.position) changes.position = position;
            if (password) changes.password = '************'; // Don't send actual password in email message

            if (Object.keys(changes).length > 0 && originalEmployeeData.personal_email) {
              // Construct email message body with HTML
              let emailMessage = `
                <p>Dear ${fullName},</p>
                <p>Your employee profile has been updated by an administrator.</p>
                <p>Details of changes:</p>
                <ul>
              `;
              if (changes.fullName) emailMessage += `<li><strong>Full Name:</strong> ${changes.fullName}</li>`;
              if (changes.department) emailMessage += `<li><strong>Department:</b> ${changes.department}</li>`;
              if (changes.position) emailMessage += `<li><strong>Position:</strong> ${changes.position}</li>`;
              if (changes.password) emailMessage += `<li><strong>Password:</strong> ${changes.password} (if changed)</li>`;
              emailMessage += `</ul>
                <p>If you have any questions, please contact your administrator.</p>
                <p>Best regards,<br>ArgusScan Team</p>
              `;

              sendEmployeeEmail(originalEmployeeData.personal_email, `Your ArgusScan Profile Has Been Updated`, emailMessage);
            }

            inlineEditRow.style.display = 'none'; // Hide the inline form
            const editButtonIcon = document.querySelector(`.edit-employee-btn[data-emp-id="${empId}"] i`);
            if (editButtonIcon) editButtonIcon.classList.replace('bi-x-lg', 'bi-pencil'); // Change icon back
            fetchEmployees(); // Refresh employee list
          } else {
            showToast('Error', 'Update failed: ' + (result.error || 'Unknown error'), 'error');
          }
        } catch (error) {
          console.error('Error updating employee:', error);
          showToast('Error', 'An error occurred while updating employee', 'error');
        } finally {
          updateBtn.disabled = false;
          updateBtn.innerHTML = originalBtnText;
        }
    }
  });

  // Function to send email
  async function sendEmployeeEmail(toEmail, subject, messageBody) {
    try {
        const response = await fetch('/admin/send_employee_email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to: toEmail,
                subject: subject,
                message: messageBody
            })
        });

        const result = await response.json();
        if (response.ok) {
            console.log('Email sent successfully:', result.message);
        } else {
            console.error('Failed to send email:', result.message);
        }
    } catch (error) {
        console.error('Network error sending email:', error);
    }
  }

  // Handle Delete Employee Modal opening (for single delete)
  document.getElementById('employeesTableBody')?.addEventListener('click', function(event) {
    if (event.target.closest('.delete-employee-btn')) {
      const button = event.target.closest('.delete-employee-btn');
      const empId = button.dataset.empId;
      const fullName = button.dataset.fullName;

      document.getElementById('deleteEmpId').value = empId;
      document.getElementById('employeeToDelete').textContent = `${fullName} (${empId})`;

      const deleteModal = new bootstrap.Modal(document.getElementById('deleteEmployeeModal'));
      deleteModal.show();
    }
  });

  // Handle Delete Confirmation (for single delete)
  document.getElementById('confirmDelete')?.addEventListener('click', async function() {
    const empId = document.getElementById('deleteEmpId').value;

    const confirmBtn = this;
    const originalBtnText = confirmBtn.innerHTML;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Deleting...';

    try {
      const employeeResponse = await fetch(`/admin/api/employees/${empId}`);
      const employeeData = await employeeResponse.json();

      if (!employeeResponse.ok) {
          showToast('Error', 'Error fetching employee details for deletion: ' + (employeeData.error || 'Unknown error'), 'error');
          return;
      }

      // First, try to send deletion email if personal email exists
      if (employeeData.personal_email) {
        const emailMessage = `
            <p>Dear ${employeeData.full_name},</p>
            <p>Your employee account with Employee ID: <strong>${employeeData.emp_id}</strong> has been deleted from the ArgusScan system by an administrator.</p>
            <p>If you believe this is an error, please contact your HR department or system administrator.</p>
            <p>Best regards,<br>ArgusScan Team</p>
        `;
        sendEmployeeEmail(employeeData.personal_email, 'Your ArgusScan Account Has Been Deleted', emailMessage);
      }

      // Then proceed with deletion from database
      const deleteResponse = await fetch(`/admin/api/employees/${empId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      const deleteResult = await deleteResponse.json();

      if (deleteResponse.ok) {
        showToast('Success', deleteResult.message || 'Employee deleted successfully!', 'success');
        const deleteModal = bootstrap.Modal.getInstance(document.getElementById('deleteEmployeeModal'));
        if (deleteModal) deleteModal.hide();
        fetchEmployees(); // Refresh employee list
      } else {
        showToast('Error', 'Deletion failed: ' + (deleteResult.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('Error deleting employee:', error);
      showToast('Error', 'An error occurred while deleting employee', 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = originalBtnText;
    }
  });

  // Bulk Import with Images (remains as modal) - no changes to this logic, just UI/button visibility
  document.getElementById('startImport')?.addEventListener('click', async function() {
      const dataFileInput = document.getElementById('importFile');
      const imageFilesInput = document.getElementById('importImages');

      if (!dataFileInput.files.length) {
          showToast('Error', 'Please select a data file (Excel or CSV).', 'error');
          return;
      }
      if (!imageFilesInput.files.length) {
          showToast('Error', 'Please select an images folder containing employee photos.', 'error');
          return;
      }

      const progressBar = document.querySelector('#import-progress .progress-bar');
      const importStatus = document.getElementById('import-status');
      document.getElementById('import-progress').style.display = 'block';
      progressBar.style.width = '0%';
      progressBar.textContent = '0%';
      importStatus.textContent = 'Reading data file...';

      try {
          // 1. Create a map of image files for quick lookup
          const imageFileMap = new Map();
          for (const file of imageFilesInput.files) {
              imageFileMap.set(file.name, file);
          }

          // 2. Read and parse the data file
          const dataFile = dataFileInput.files[0];
          const data = await dataFile.arrayBuffer();
          const workbook = XLSX.read(data);
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const employeeData = XLSX.utils.sheet_to_json(worksheet);

          if (employeeData.length === 0) {
              showToast('Error', 'The data file is empty or in the wrong format.', 'error');
              document.getElementById('import-progress').style.display = 'none';
              importStatus.textContent = '';
              return;
          }

          // 3. Combine data and images
          importStatus.textContent = 'Processing records and images...';
          const combinedData = [];
          for (const emp of employeeData) {
              // Validate essential fields before processing image to save time
              if (!emp.emp_id || !emp.full_name || !emp.email || !emp.department || !emp.position || !emp.password) {
                  showToast('Warning', `Skipping row for employee ID '${emp.emp_id || "N/A"}' due to missing essential fields.`, 'warning');
                  continue;
              }

              const imageFilename = emp.image_filename;
              if (imageFilename && imageFileMap.has(imageFilename)) {
                  const imageFile = imageFileMap.get(imageFilename);
                  const photoData = await new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = e => resolve(e.target.result.split(',')[1]);
                      reader.onerror = err => reject(err);
                      reader.readAsDataURL(imageFile);
                  });
                  emp.photoData = photoData;
              } else if (imageFilename) {
                  showToast('Warning', `Image file '${imageFilename}' not found for employee ID '${emp.emp_id}'. Employee will be added without a photo.`, 'warning');
                  emp.photoData = ''; // Ensure photoData is empty if file not found
              } else {
                  showToast('Warning', `No image filename provided for employee ID '${emp.emp_id}'. Employee will be added without a photo.`, 'warning');
                  emp.photoData = '';
              }
              combinedData.push(emp);
          }

          if (combinedData.length === 0) {
              showToast('Error', 'No valid employee data with photos or image filenames found for import.', 'error');
              document.getElementById('import-progress').style.display = 'none';
              importStatus.textContent = '';
              return;
          }

          // 4. Send to backend
          importStatus.textContent = 'Uploading data to server...';
          // Using Fetch API instead of XMLHttpRequest for consistency and modern practices
          const response = await fetch('/admin/api/bulk_import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(combinedData)
          });

          const result = await response.json();

          if (response.ok) { // Check response.ok for 2xx status codes
              progressBar.style.width = '100%';
              progressBar.textContent = '100%';
              importStatus.innerHTML = `Import complete!<br>Successful: ${result.successful}, Failed: ${result.failed}`;
              showToast('Success', result.message || `Bulk import finished. Successful: ${result.successful}, Failed: ${result.failed}`, 'success');

              const bulkImportModal = bootstrap.Modal.getInstance(document.getElementById('bulkImportModal'));
              if (bulkImportModal) bulkImportModal.hide(); // Hide modal on success

              fetchEmployees(); // Refresh employee list
          } else {
              showToast('Error', `Import failed: ${result.error || 'Unknown error during upload.'}`, 'error');
              importStatus.textContent = `Error: ${result.error || 'Unknown error'}`;
          }
      } catch (error) {
          showToast('Error', `An error occurred during import: ${error.message}`, 'error');
          console.error(error);
          document.getElementById('import-progress').style.display = 'none';
          importStatus.textContent = '';
      } finally {
          // Reset progress bar display after some delay even on error
          setTimeout(() => {
              document.getElementById('import-progress').style.display = 'none';
              importStatus.textContent = '';
          }, 3000);
      }
  });

  // Function to fetch and display employees
  async function fetchEmployees() {
    try {
      const response = await fetch('/admin/api/employees');
      allEmployees = await response.json();
      filterAndDisplayEmployees(); // Display all initially
      populateEmployeeEmailDropdown(allEmployees); // Populate dropdown for email reports
    } catch (error) {
      console.error('Error fetching employees:', error);
      showToast('Error', 'Failed to load employee data.', 'error');
    }
  }

  // Function to filter and display employees based on current filters
  function filterAndDisplayEmployees() {
    const searchQuery = document.getElementById('searchQuery').value.toLowerCase();
    const departmentFilter = document.getElementById('departmentFilter').value;
    const employeesTableBody = document.getElementById('employeesTableBody');
    employeesTableBody.innerHTML = ''; // Clear existing rows

    const filteredEmployees = allEmployees.filter(employee => {
      const matchesSearch =
        employee.full_name.toLowerCase().includes(searchQuery) ||
        employee.emp_id.toLowerCase().includes(searchQuery) ||
        employee.email.toLowerCase().includes(searchQuery) ||
        (employee.personal_email && employee.personal_email.toLowerCase().includes(searchQuery));

      const matchesDepartment = departmentFilter === '' || employee.department === departmentFilter;

      return matchesSearch && matchesDepartment;
    });

    if (filteredEmployees.length === 0) {
      employeesTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-muted">No employees found.</td></tr>`;
      return;
    }

    filteredEmployees.forEach(employee => {
      const row = `
        <tr>
          <td>
            <div class="d-flex align-items-center">
              <div>
                <div class="fw-semibold">${employee.full_name}</div>
                <small class="text-muted">${employee.email}</small>
              </div>
            </div>
          </td>
          <td>${employee.emp_id}</td>
          <td>${employee.personal_email || '-'}</td>
          <td>${employee.department || '-'}</td>
          <td>${employee.position || '-'}</td>
          <td>
            <div class="action-buttons">
              <button class="btn btn-sm btn-outline-primary me-1 edit-employee-btn" title="Edit"
                      data-emp-id="${employee.emp_id}">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger delete-employee-btn" title="Delete"
                      data-emp-id="${employee.emp_id}" data-full-name="${employee.full_name}">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </td>
        </tr>
        <tr id="edit-row-${employee.emp_id}" class="inline-edit-row" style="display: none;" data-original-emp-id="${employee.emp_id}">
          <td colspan="6">
            <div class="p-3 bg-light rounded shadow-sm mb-3">
              <h6 class="mb-3"><i class="bi bi-pencil-square me-2"></i>Edit Employee Details</h6>
              <form class="row g-3">
                <input type="hidden" class="edit-emp-id-original" value="${employee.emp_id}">
                <div class="col-md-6">
                  <label for="editFullName-${employee.emp_id}" class="form-label">Full Name</label>
                  <input type="text" class="form-control edit-full-name" id="editFullName-${employee.emp_id}" value="${employee.full_name}" required>
                </div>
                <div class="col-md-6">
                  <label for="editEmployeeId-${employee.emp_id}" class="form-label">Employee ID</label>
                  <input type="text" class="form-control edit-employee-id" id="editEmployeeId-${employee.emp_id}" value="${employee.emp_id}" readonly>
                </div>
                <div class="col-md-6">
                  <label for="editEmail-${employee.emp_id}" class="form-label">Company Email</label>
                  <input type="email" class="form-control edit-email" id="editEmail-${employee.emp_id}" value="${employee.email}" readonly>
                </div>
                <div class="col-md-6">
                  <label for="editPersonalEmail-${employee.emp_id}" class="form-label">Personal Email</label>
                  <input type="email" class="form-control edit-personal-email" id="editPersonalEmail-${employee.emp_id}" value="${employee.personal_email || ''}" pattern="[^\\s@]+@[^\\s@]+\\.[^@]+" title="Please enter a valid email address">
                </div>
                <div class="col-md-6">
                  <label for="editDepartment-${employee.emp_id}" class="form-label">Department</label>
                  <select class="form-select edit-department" id="editDepartment-${employee.emp_id}" required>
                    <option value="">Select Department</option>
                    <option value="Engineering" ${employee.department === 'Engineering' ? 'selected' : ''}>Engineering</option>
                    <option value="Data Science" ${employee.department === 'Data Science' ? 'selected' : ''}>Data Science</option>
                    <option value="Marketing" ${employee.department === 'Marketing' ? 'selected' : ''}>Marketing</option>
                    <option value="HR" ${employee.department === 'HR' ? 'selected' : ''}>Human Resources</option>
                    <option value="Finance" ${employee.department === 'Finance' ? 'selected' : ''}>Finance</option>
                    <option value="Operations" ${employee.department === 'Operations' ? 'selected' : ''}>Operations</option>
                    <option value="Not assigned" ${employee.department === 'Not assigned' ? 'selected' : ''}>Not assigned</option>
                  </select>
                </div>
                <div class="col-md-6">
                  <label for="editPosition-${employee.emp_id}" class="form-label">Position</label>
                  <input type="text" class="form-control edit-position" id="editPosition-${employee.emp_id}" value="${employee.position}" required>
                </div>
                <div class="col-md-6">
                  <label for="editPassword-${employee.emp_id}" class="form-label">New Password</label>
                  <div class="input-group">
                    <input type="password" class="form-control edit-password" id="editPassword-${employee.emp_id}" pattern="(?=.*\d)(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}" title="Password must be at least 8 characters, contain at least one uppercase letter, one number, and one special character">
                    <button class="btn btn-outline-secondary password-generate-inline" type="button">
                      <i class="bi bi-arrow-repeat"></i> Generate
                    </button>
                  </div>
                  <small class="text-muted">Leave blank to keep current password</small>
                </div>
                <div class="col-12 text-end">
                  <button type="button" class="btn btn-primary update-employee-inline">Update Employee</button>
                </div>
              </form>
            </div>
          </td>
        </tr>
      `;
      employeesTableBody.insertAdjacentHTML('beforeend', row);
      // Attach input event listeners for dynamic validation on newly added row
      const newRowElement = employeesTableBody.lastElementChild;
      newRowElement.querySelectorAll('input, select').forEach(element => {
          element.addEventListener('input', () => {
              if (element.checkValidity()) {
                  element.classList.remove('is-invalid');
                  element.classList.add('is-valid');
              } else {
                  element.classList.remove('is-valid');
                  element.classList.add('is-invalid');
              }
          });
      });
    });
  }

  // --- Email Report Feature Logic ---

  // Populate employee email dropdown in the modal
  function populateEmployeeEmailDropdown(employees) {
    const selectElement = document.getElementById('reportRecipientEmployee');
    selectElement.innerHTML = '<option value="">Select an employee...</option>'; // Clear existing
    employees.forEach(employee => {
      if (employee.personal_email && employee.personal_email !== '-') { // Only add if personal email exists
        const option = document.createElement('option');
        option.value = employee.personal_email;
        option.setAttribute('data-emp-id', employee.emp_id); // Store emp_id
        option.textContent = `${employee.full_name} (${employee.personal_email})`;
        selectElement.appendChild(option);
      }
    });
  }

  // Handle report type change to update subject
  document.querySelectorAll('input[name="reportType"]').forEach(radio => {
    radio.addEventListener('change', function() {
      const subjectInput = document.getElementById('reportEmailSubject');
      if (this.value === 'attendance') {
        subjectInput.value = 'Your ArgusScan Attendance Report';
      } else if (this.value === 'regularization') {
        subjectInput.value = 'Your ArgusScan Regularization Records';
      }
    });
  });

  // Handle Send Report Button Click
  document.getElementById('sendEmployeeReportBtn')?.addEventListener('click', async function() {
    const selectedEmployeeOption = document.getElementById('reportRecipientEmployee').selectedOptions[0];
    const recipientEmail = selectedEmployeeOption?.value;
    const empId = selectedEmployeeOption?.dataset.empId; // Get emp_id of selected user
    const subject = document.getElementById('reportEmailSubject').value.trim();
    const messageBodyElement = document.getElementById('reportEmailMessageBody');
    const reportType = document.querySelector('input[name="reportType"]:checked').value;
    const startDate = document.getElementById('reportStartDate').value; // Get start date
    const endDate = document.getElementById('reportEndDate').value;     // Get end date


    if (!recipientEmail || !empId || !subject) {
      showToast('Error', 'Please select an employee and fill in the subject.', 'error');
      return;
    }

    this.disabled = true;
    this.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Generating...';

    let reportData = [];
    let generatedReportHtml = '';

    try {
      if (reportType === 'attendance') {
        // Fetch attendance records for the selected employee with date filters
        const response = await fetch(`/admin/api/attendance_records_for_employee?emp_id=${empId}&start_date=${startDate}&end_date=${endDate}`);
        const data = await response.json();
        if (response.ok) {
          reportData = data;
          generatedReportHtml = generateAttendanceReportHtml(reportData, selectedEmployeeOption.textContent);
        } else {
          throw new Error(data.message || 'Failed to fetch attendance records.');
        }
      } else if (reportType === 'regularization') {
        // Fetch regularization records for the selected employee with date filters
        const response = await fetch(`/admin/api/regularization_records_for_employee?emp_id=${empId}&start_date=${startDate}&end_date=${endDate}`);
        const data = await response.json();
        if (response.ok) {
          reportData = data;
          generatedReportHtml = generateRegularizationReportHtml(reportData, selectedEmployeeOption.textContent);
        } else {
          throw new Error(data.message || 'Failed to fetch regularization records.');
        }
      }

      messageBodyElement.value = generatedReportHtml;

      // Now send the email
      await sendReportEmail(recipientEmail, subject, messageBodyElement.value);

      showToast('Success', 'Report sent successfully!', 'success');
      const emailReportModal = bootstrap.Modal.getInstance(document.getElementById('emailReportModal'));
      if (emailReportModal) emailReportModal.hide();

      // Reset modal fields after sending
      document.getElementById('reportRecipientEmployee').value = '';
      document.getElementById('attendanceReport').checked = true; // Default to attendance
      document.getElementById('reportEmailSubject').value = 'Your ArgusScan Attendance Report';
      document.getElementById('reportEmailMessageBody').value = '';
      document.getElementById('reportStartDate').value = ''; // Clear date fields
      document.getElementById('reportEndDate').value = '';     // Clear date fields

    } catch (error) {
      console.error('Error generating or sending report:', error);
      showToast('Error', `Failed to send report: ${error.message}`, 'error');
    } finally {
      this.disabled = false;
      this.innerHTML = '<i class="bi bi-check-lg me-1"></i> Send Report';
    }
  });

  async function sendReportEmail(toEmail, subject, messageBody) {
    const response = await fetch('/admin/api/send_report_email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: toEmail,
        subject: subject,
        message: messageBody
      })
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Server error sending email.');
    }
    return response.json();
  }

  function generateAttendanceReportHtml(records, employeeName) {
    let html = `
      <p style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">Dear ${employeeName.split('(')[0].trim()},</p>
      <p style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">Here is your attendance report:</p>
      <table style="width:100%; border-collapse: collapse; margin-top: 15px;">
        <thead style="background-color: #f2f2f2;">
          <tr>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left; font-family: Arial, sans-serif; font-size: 12px; color: #555;">Date</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left; font-family: Arial, sans-serif; font-size: 12px; color: #555;">Punch In</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left; font-family: Arial, sans-serif; font-size: 12px; color: #555;">Punch Out</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left; font-family: Arial, sans-serif; font-size: 12px; color: #555;">Status</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left; font-family: Arial, sans-serif; font-size: 12px; color: #555;">Location</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (records.length > 0) {
      records.forEach(record => {
        html += `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: Arial, sans-serif; font-size: 12px; color: #333;">${record.date}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: Arial, sans-serif; font-size: 12px; color: #333;">${record.punch_in || '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: Arial, sans-serif; font-size: 12px; color: #333;">${record.punch_out || '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: Arial, sans-serif; font-size: 12px; color: #333;">${record.status}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: Arial, sans-serif; font-size: 12px; color: #333;">${record.punch_in_address || '-'}</td>
          </tr>
        `;
      });
    } else {
      html += `<tr><td colspan="5" style="padding: 8px; border: 1px solid #ddd; text-align: center; font-family: Arial, sans-serif; font-size: 12px; color: #777;">No attendance records found for this employee within the selected date range.</td></tr>`;
    }

    html += `</tbody></table><p style="font-family: Arial, sans-serif; font-size: 14px; color: #333; margin-top: 20px;">Best regards,<br>ArgusScan Team</p>`;
    return html;
  }

  function generateRegularizationReportHtml(records, employeeName) {
    let html = `
      <p style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">Dear ${employeeName.split('(')[0].trim()},</p>
      <p style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">Here are your regularization records:</p>
      <table style="width:100%; border-collapse: collapse; margin-top: 15px;">
        <thead style="background-color: #f2f2f2;">
          <tr>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left; font-family: Arial, sans-serif; font-size: 12px; color: #555;">Date</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left; font-family: Arial, sans-serif; font-size: 12px; color: #555;">Original In</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left; font-family: Arial, sans-serif; font-size: 12px; color: #555;">Original Out</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left; font-family: Arial, sans-serif; font-size: 12px; color: #555;">Modified In</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left; font-family: Arial, sans-serif; font-size: 12px; color: #555;">Modified Out</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left; font-family: Arial, sans-serif; font-size: 12px; color: #555;">Reason</th>
            <th style="padding: 10px; border: 1px solid #ddd; text-align: left; font-family: Arial, sans-serif; font-size: 12px; color: #555;">Comments</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (records.length > 0) {
      records.forEach(record => {
        html += `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: Arial, sans-serif; font-size: 12px; color: #333;">${record.date}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: Arial, sans-serif; font-size: 12px; color: #333;">${record.original_punch_in || '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: Arial, sans-serif; font-size: 12px; color: #333;">${record.original_punch_out || '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: Arial, sans-serif; font-size: 12px; color: #333;">${record.modified_punch_in || '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: Arial, sans-serif; font-size: 12px; color: #333;">${record.modified_punch_out || '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: Arial, sans-serif; font-size: 12px; color: #333;">${record.regularized_reason || '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: Arial, sans-serif; font-size: 12px; color: #333;">${record.regularized_comments || '-'}</td>
          </tr>
        `;
      });
    } else {
      html += `<tr><td colspan="7" style="padding: 8px; border: 1px solid #ddd; text-align: center; font-family: Arial, sans-serif; font-size: 12px; color: #777;">No regularization records found for this employee within the selected date range.</td></tr>`;
    }

    html += `</tbody></table><p style="font-family: Arial, sans-serif; font-size: 14px; color: #333; margin-top: 20px;">Best regards,<br>ArgusScan Team</p>`;
    return html;
  }
});