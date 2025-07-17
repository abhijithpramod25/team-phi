document.addEventListener('DOMContentLoaded', function() {
    // Filter form submission
    document.getElementById('regularizationFilterForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const params = new URLSearchParams(formData);
        window.location.href = window.location.pathname + '?' + params.toString();
    });

    // Reset filters
    document.getElementById('resetFilters')?.addEventListener('click', function() {
        window.location.href = window.location.pathname;
    });

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

    // Export functionality
    document.getElementById('exportExcel')?.addEventListener('click', function(e) {
        e.preventDefault();
        exportRegularization('xlsx');
    });

    document.getElementById('exportCSV')?.addEventListener('click', function(e) {
        e.preventDefault();
        exportRegularization('csv');
    });
});

function exportRegularization(format) {
    // Get all current filter values
    const employeeFilter = document.getElementById('employeeFilter')?.value || '';
    const startDateFilter = document.getElementById('startDateFilter')?.value || '';
    const endDateFilter = document.getElementById('endDateFilter')?.value || '';

    // Construct query parameters
    const params = new URLSearchParams();
    if (employeeFilter) params.append('employee', employeeFilter);
    if (startDateFilter) params.append('start_date', startDateFilter);
    if (endDateFilter) params.append('end_date', endDateFilter);
    params.append('format', format); // Use format directly

    // Submit the export request
    window.location.href = `/admin/export_regularization?${params.toString()}`;
}

// Unified showToast function for admin pages (copied from admin_emp_manage.js for consistency)
function showToast(title, message, type = 'success') {
    const toastEl = document.getElementById('liveToast');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');

    toastTitle.textContent = title;
    toastMessage.textContent = message;

    const toast = new bootstrap.Toast(toastEl);
    const header = toastEl.querySelector('.toast-header');

    // Reset classes first
    header.classList.remove('bg-success', 'bg-danger', 'bg-primary', 'text-white', 'bg-warning', 'text-dark', 'bg-info');
    toastEl.classList.remove('bg-success', 'bg-danger', 'bg-primary', 'text-white', 'bg-warning', 'text-dark', 'bg-info');
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
    } else if (type === 'info') {
      header.classList.add('bg-info', 'text-white');
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