// admin_dashboard.js
document.addEventListener('DOMContentLoaded', function() {
  // Sidebar toggle functionality
  document.getElementById('sidebarToggle').addEventListener('click', function() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('show');
    document.body.classList.toggle('sidebar-open');
  });

  // Close sidebar when clicking outside
  document.addEventListener('click', function(event) {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebar.classList.contains('show') && !sidebar.contains(event.target) && !sidebarToggle.contains(event.target)) {
      sidebar.classList.remove('show');
      document.body.classList.remove('sidebar-open');
    }
  });

  // Initialize tooltips for info icons
  var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
  var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl)
  });


  // Check if elements specific to admin_dashboard.html exist before attaching listeners
  const exportExcelBtn = document.getElementById('exportExcel');
  const exportCSVBtn = document.getElementById('exportCSV');

  if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', function(e) {
      e.preventDefault();
      exportData('xlsx');
    });
  }

  if (exportCSVBtn) {
    exportCSVBtn.addEventListener('click', function(e) {
      e.preventDefault();
      exportData('csv');
    });
  }

  function exportData(format) {
    // Get all current filter values from the form
    const startDate = document.getElementById('start_date')?.value || '';
    const endDate = document.getElementById('end_date')?.value || '';
    const empId = document.getElementById('emp_id')?.value || '';
    const status = document.getElementById('status')?.value || '';
    // Sort is not typically part of export filters unless explicitly needed
    // const sort = document.getElementById('sort').value;

    // Construct query parameters
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (empId) params.append('emp_id', empId);
    if (status) params.append('status', status);
    // if (sort) params.append('sort', sort); // Uncomment if sort parameter is needed for export
    params.append('format', format); // Use format directly

    // Submit the export request
    window.location.href = `/admin/export_attendance?${params.toString()}`;
  }

  // Unified showToast function for admin pages
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
    else { // Default to primary/info for general notifications
      header.classList.add('bg-primary', 'text-white');
      toastEl.classList.add('bg-primary');
      toastMessage.classList.add('text-white');
    }

    toast.show();
  }

});