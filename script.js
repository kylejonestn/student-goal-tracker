/* ======================================================================= *
 * CONFIGURATION & GLOBAL STATE
 * ======================================================================= */
const API_URL = "https://script.google.com/macros/s/AKfycbxbu8EHFE8l9x8ZFK4efuWHkhMkjC6JN421qYVlwySEBvDpRGBfp9ONlNKJOOEfzPg4hQ/exec"; 

let userProfile = null;
let id_token = null;
let spreadsheetId = null;
let allStudents = []; 
let selectedStudent = null; 
let currentSortOrder = 'lastUpdated';
let showInactiveStudents = false;
let currentStudentGoals = []; 
let selectedGoal = null; 
const GOAL_COLORS = ['#4285F4', '#DB4437', '#F4B400', '#0F9D58', '#AB47BC', '#00ACC1', '#FF7043', '#5C6BC0'];
let goalColorMap = new Map();
let allTags = [];
let selectedTagIds = new Set();
let currentReportObservations = []; 


/* ======================================================================= *
 * INITIALIZATION
 * ======================================================================= */
document.addEventListener('DOMContentLoaded', function() {
  // Main Listeners
    document.getElementById('setup-spreadsheet-btn').addEventListener('click', triggerSetup);
  document.getElementById('studentSearch').addEventListener('input', () => filterStudents(document.getElementById('studentSearch').value));
  document.getElementById('edit-student-btn').addEventListener('click', editStudent);
  document.getElementById('submitObservationBtn').addEventListener('click', submitObservation);
  
  // Control Listeners
  document.getElementById('sort-by-update-btn').addEventListener('click', () => setSortOrder('lastUpdated'));
  document.getElementById('sort-alpha-btn').addEventListener('click', () => setSortOrder('alphabetical'));
  document.getElementById('toggle-inactive-btn').addEventListener('click', toggleInactiveStudents);
  document.getElementById('copyReportIcon').addEventListener('click', copyReportContent); 
  document.getElementById('downloadPdfIcon').addEventListener('click', downloadReportAsPdf); 
  document.getElementById('show-hidden-toggle').addEventListener('change', handleShowHiddenToggle);
  document.getElementById('reset-filter-btn').addEventListener('click', resetReportFilter);
  
  // Modal Event Listeners
  document.getElementById('closeModalBtn').addEventListener('click', closeSuccessModal);
  document.getElementById('addAnotherObservationBtn').addEventListener('click', closeSuccessModal); 
  document.getElementById('closeGoalModalBtn').addEventListener('click', closeGoalModal);
  document.getElementById('cancelGoalModalBtn').addEventListener('click', closeGoalModal);
  document.getElementById('goalForm').addEventListener('submit', handleGoalFormSubmit);
  document.getElementById('closeStudentModalBtn').addEventListener('click', closeStudentModal);
  document.getElementById('cancelStudentModalBtn').addEventListener('click', closeStudentModal);
  document.getElementById('studentForm').addEventListener('submit', handleStudentFormSubmit);
  document.getElementById('closeTagModalBtn').addEventListener('click', closeTagModal);
  document.getElementById('cancelTagModalBtn').addEventListener('click', closeTagModal);
  document.getElementById('tagForm').addEventListener('submit', handleTagFormSubmit);

  // Global click listener to close modals/menus
  window.onclick = function(event) {
    if (event.target.classList.contains('modal-overlay')) closeAllModals();
    document.querySelectorAll('.options-menu').forEach(menu => {
      if (menu.style.display === 'flex' && !menu.contains(event.target) && !event.target.closest('.options-button')) {
        menu.style.display = 'none';
      }
    });
  };
});


/* ======================================================================= *
 * API COMMUNICATION
 * ======================================================================= */
async function apiRequest(action, payload = {}, showLoading = true) {
  if (showLoading) document.getElementById('app-status').textContent = 'Loading...';
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'Authorization': `Bearer ${id_token}`
      },
      body: JSON.stringify({ action, payload }),
      redirect: "follow"
    });
    
    const result = await response.json();

    if (result.status === 'SUCCESS') {
      if (showLoading) document.getElementById('app-status').textContent = '';
      return result.data;
    } else {
      throw new Error(result.message || 'An unknown API error occurred.');
    }
  } catch (error) {
    handleError(error);
    return Promise.reject(error);
  }
}


/* ======================================================================= *
 * AUTHENTICATION & ONBOARDING
 * ======================================================================= */

// This function is called by Google after a successful sign-in
function handleCredentialResponse(response) {
  id_token = response.credential;
  
  // First, verify the user's identity with our backend
  fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'verifyToken', token: id_token })
  })
  .then(res => res.json())
  .then(result => {
    if (result.status === 'SUCCESS') {
      userProfile = result.data;
      // Show the main app container
      document.getElementById('sign-in-view').style.display = 'none';
      document.getElementById('app-container').style.display = 'block';
      // Now, check if this verified user has set up their spreadsheet
      checkUserSetup();
    } else {
      handleError(new Error(result.message));
    }
  })
  .catch(handleError);
}

// This new function asks our server if the user is new or returning
async function checkUserSetup() {
  const setupStatus = await apiRequest('checkUserSetup', {}, false); // false = don't show "Loading..."
  if (setupStatus.isSetup) {
    // If they are a returning user, store their spreadsheetId...
    spreadsheetId = setupStatus.spreadsheetId;
    // ...show the main app UI...
    showMainAppUI();
    // ...and load their data.
    await loadInitialData();
  } else {
    // If they are a new user, show the onboarding screen.
    showOnboardingUI();
  }
}

// This new function shows only the "Welcome" screen
function showOnboardingUI() {
  document.querySelectorAll('.section, .report-section, h1').forEach(el => el.style.display = 'none');
  document.getElementById('onboarding-view').style.display = 'block';
}

// This new function shows the main application interface
function showMainAppUI() {
  document.querySelectorAll('.section, .report-section, h1').forEach(el => el.style.display = 'block');
  document.getElementById('onboarding-view').style.display = 'none';
  
  // Hide sections that require a student selection
  document.getElementById('goals-section').style.display = 'none';
  document.getElementById('observation-section').style.display = 'none';
  document.getElementById('report-section').style.display = 'none';
}

async function triggerSetup() {
  const setupBtn = document.getElementById('setup-spreadsheet-btn');
  setupBtn.disabled = true;
  setupBtn.textContent = 'Creating Spreadsheet...';
  document.getElementById('app-status').textContent = 'Please wait, this may take a moment...';

  try {
    const result = await apiRequest('setupNewUser', {}, false); // Call the backend
    
    if (result && result.spreadsheetId) {
      spreadsheetId = result.spreadsheetId; // Store the new ID from the server
      document.getElementById('app-status').textContent = 'Setup complete! Loading app...';
      
      // Transition to the main app view
      showMainAppUI();
      // Load the initial (empty) data from the newly created sheet
      await loadInitialData(); 
    }
  } catch (error) {
    // apiRequest's handleError will have already shown the message,
    // so we just need to re-enable the button for another try.
    setupBtn.disabled = false;
    setupBtn.textContent = 'Create My Spreadsheet';
  }
}

/* ======================================================================= *
 * CORE APP LOGIC (This function might have been named initializeApp before)
 * ======================================================================= */
async function loadInitialData() {
  const data = await apiRequest('getInitialData', { sortBy: currentSortOrder });
  if (data) {
    allStudents = data.students;
    allTags = data.tags;
    filterStudents('');
  }
}

async function selectStudent(student) {
  selectedStudent = student;
  selectedGoal = null; 
  document.getElementById('studentSearch').value = `${student.FirstName} ${student.LastName}`;
  document.getElementById('selected-student-display').textContent = `Selected: ${student.FirstName} ${student.LastName}`;
  document.getElementById('student-search-results').style.display = 'none'; 
  document.getElementById('edit-student-btn').style.display = 'inline-flex'; 
  document.getElementById('selected-goal-display').style.display = 'none'; 
  document.getElementById('selected-goal-display').innerHTML = '';
  document.getElementById('current-student-name').textContent = `${student.FirstName}`;
  document.getElementById('goals-section').style.display = 'block';
  document.getElementById('observation-section').style.display = 'block';
  document.getElementById('report-section').style.display = 'block'; 
  
  renderTagSelection();
  
  const data = await apiRequest('getDataForStudent', { studentId: student.StudentID });
  if (data) {
    renderGoals(data.goals);
    const toggle = document.getElementById('show-hidden-toggle');
    if (toggle) {
      toggle.checked = false;
      document.getElementById('report-section').classList.remove('is-showing-hidden');
    }
    currentReportObservations = data.reportData;
    displayReport(currentReportObservations);
  }
}

async function submitObservation() {
  if (!selectedStudent) return;
  const note = document.getElementById('observationNote').value.trim();
  if (note === '') return;
  
  document.getElementById('submitObservationBtn').disabled = true;

  const observationData = { 
    studentId: selectedStudent.StudentID,
    goalId: selectedGoal ? selectedGoal.GoalID : '',
    observationNote: note,
    teacherEmail: userProfile.email,
    tagIds: Array.from(selectedTagIds)
  };
  
  const result = await apiRequest('saveObservation', observationData, false);
  if (result) {
    document.getElementById('observationNote').value = '';
    showSuccessModal();
  }
  document.getElementById('submitObservationBtn').disabled = false;
}


/* ======================================================================= *
 * UI & STATE CONTROLS
 * ======================================================================= */
function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => modal.style.display = 'none');
}

async function setSortOrder(newOrder) {
  if (currentSortOrder === newOrder) return;
  currentSortOrder = newOrder;
  document.getElementById('sort-by-update-btn').classList.toggle('active', newOrder === 'lastUpdated');
  document.getElementById('sort-alpha-btn').classList.toggle('active', newOrder === 'alphabetical');
  await loadStudents();
}

function toggleInactiveStudents() {
  showInactiveStudents = !showInactiveStudents;
  const btn = document.getElementById('toggle-inactive-btn');
  const icon = btn.querySelector('.material-symbols-outlined');
  if (showInactiveStudents) {
    icon.textContent = 'visibility';
    btn.title = 'Hide Inactive Students';
  } else {
    icon.textContent = 'visibility_off';
    btn.title = 'Show Inactive Students';
  }
  filterStudents(document.getElementById('studentSearch').value);
}

function handleShowHiddenToggle(event) {
  const reportSection = document.getElementById('report-section');
  if (reportSection) {
    reportSection.classList.toggle('is-showing-hidden', event.target.checked);
  }
}


/* ======================================================================= *
 * STUDENT SELECTION MODULE
 * ======================================================================= */
async function loadStudents() {
  document.getElementById('app-status').textContent = 'Loading students...';
  selectedStudent = null;
  document.getElementById('studentSearch').value = '';
  document.getElementById('goals-section').style.display = 'none';
  document.getElementById('report-section').style.display = 'none';
  document.getElementById('edit-student-btn').style.display = 'none';
  document.getElementById('selected-student-display').style.display = 'none';

  const data = await apiRequest('getInitialData', { sortBy: currentSortOrder });
  if (data) {
    allStudents = data.students;
    allTags = data.tags;
    filterStudents('');
  }
}

function filterStudents(searchText) {
  const resultsDiv = document.getElementById('student-search-results');
  resultsDiv.innerHTML = ''; 
  resultsDiv.style.display = 'block'; 
  const lowerSearchText = searchText.toLowerCase().trim();

  const studentsToList = showInactiveStudents ? allStudents : allStudents.filter(s => s.Active);
  
  const studentsToDisplay = lowerSearchText.length > 0
    ? studentsToList.filter(s => (s.FirstName + ' ' + s.LastName).toLowerCase().includes(lowerSearchText))
    : studentsToList;

  if (studentsToDisplay.length > 0) {
    studentsToDisplay.forEach(student => appendStudentToResults(student));
  } else if (searchText.trim().length > 0) {
    const addDiv = document.createElement('div');
    addDiv.className = 'search-result-item';
    addDiv.textContent = `+ Add "${searchText.trim()}" as a New Student`;
    addDiv.onclick = () => openStudentModal(searchText.trim());
    resultsDiv.appendChild(addDiv);
  }
}

function appendStudentToResults(student) {
  const resultsDiv = document.getElementById('student-search-results');
  const studentDiv = document.createElement('div');
  studentDiv.className = 'search-result-item';
  if (!student.Active) {
    studentDiv.classList.add('inactive');
  }
  studentDiv.textContent = `${student.FirstName} ${student.LastName} (Grade: ${student.GradeLevel})`;
  studentDiv.onclick = () => selectStudent(student);
  resultsDiv.appendChild(studentDiv);
}


/* ======================================================================= *
 * STUDENT MODAL MODULE
 * ======================================================================= */
function editStudent() {
  if (selectedStudent) openStudentModal(selectedStudent);
}

function openStudentModal(studentData = null) {
  const modal = document.getElementById('studentModal');
  const form = document.getElementById('studentForm');
  form.reset();

  if (studentData && studentData.StudentID) {
    document.getElementById('studentModalTitle').textContent = "Edit Student";
    document.getElementById('studentId').value = studentData.StudentID;
    document.getElementById('studentFirstName').value = studentData.FirstName;
    document.getElementById('studentLastName').value = studentData.LastName;
    document.getElementById('studentGradeLevel').value = studentData.GradeLevel;
    document.getElementById('studentActive').checked = studentData.Active;
  } else {
    document.getElementById('studentModalTitle').textContent = "Add New Student";
    document.getElementById('studentId').value = "";
    document.getElementById('studentActive').checked = true;
    if (typeof studentData === 'string') {
      const nameParts = studentData.split(' ');
      document.getElementById('studentFirstName').value = nameParts.shift() || '';
      document.getElementById('studentLastName').value = nameParts.join(' ') || '';
    }
  }
  modal.style.display = 'flex';
}

function closeStudentModal() {
  document.getElementById('studentModal').style.display = 'none';
}

async function handleStudentFormSubmit(event) {
  event.preventDefault();
  const saveBtn = document.getElementById('saveStudentBtn');
  saveBtn.disabled = true;

  const studentData = {
    StudentID: document.getElementById('studentId').value,
    FirstName: document.getElementById('studentFirstName').value.trim(),
    LastName: document.getElementById('studentLastName').value.trim(),
    GradeLevel: document.getElementById('studentGradeLevel').value.trim(),
    Active: document.getElementById('studentActive').checked
  };

  if (!studentData.FirstName || !studentData.LastName) {
    alert('First and Last Name are required.');
    saveBtn.disabled = false; return;
  }

  const result = await apiRequest('saveStudentRecord', studentData);
  if (result) {
    document.getElementById('app-status').textContent = result.message;
    closeStudentModal();
    await loadStudentsAndSelect(result.student.StudentID);
    setTimeout(() => { document.getElementById('app-status').textContent = ''; }, 4000);
  }
  saveBtn.disabled = false;
}

async function loadStudentsAndSelect(studentIdToSelect = null) {
    const data = await apiRequest('getInitialData', { sortBy: currentSortOrder });
    if (data) {
      allStudents = data.students;
      allTags = data.tags;
      const student = allStudents.find(s => s.StudentID === studentIdToSelect);
      if (student) {
        selectStudent(student);
      } else {
        filterStudents(document.getElementById('studentSearch').value); 
      }
    }
}


/* ======================================================================= *
 * GOAL MODULE
 * ======================================================================= */
function renderGoals(goals) {
    const goalsListDiv = document.getElementById('student-goals-list');
    goalsListDiv.innerHTML = ''; 
    currentStudentGoals = goals;
    goalColorMap.clear();

    if (goals && goals.length > 0) {
      goals.forEach((goal, index) => {
        const color = GOAL_COLORS[index % GOAL_COLORS.length];
        goalColorMap.set(goal.GoalID, color);
        const goalButton = document.createElement('button');
        goalButton.className = 'goal-button';
        goalButton.textContent = goal.GoalTitle;
        goalButton.dataset.goalId = goal.GoalID;
        goalButton.style.setProperty('--goal-color', color);
        goalButton.onclick = () => selectGoalForObservation(goal, goalButton);
        goalsListDiv.appendChild(goalButton);
      });
    } else {
      goalsListDiv.innerHTML = '<p>No active goals found.</p>';
    }
    const addEditGoalIcon = document.createElement('button');
    addEditGoalIcon.id = 'addEditGoalIcon';
    addEditGoalIcon.className = 'icon-button';
    goalsListDiv.appendChild(addEditGoalIcon);
    updateAddEditGoalIcon();
}

function selectGoalForObservation(goal, buttonElement) {
  const goalDisplay = document.getElementById('selected-goal-display');
  if (selectedGoal && selectedGoal.GoalID === goal.GoalID) {
    selectedGoal = null;
    buttonElement.classList.remove('selected');
    goalDisplay.style.display = 'none';
    goalDisplay.innerHTML = '';
  } else {
    document.querySelectorAll('.goal-button.selected').forEach(btn => btn.classList.remove('selected'));
    selectedGoal = goal;
    buttonElement.classList.add('selected');
    goalDisplay.innerHTML = `
      <strong style="display: block; margin-bottom: 4px;">${goal.GoalTitle}</strong>
      <p style="margin: 0; font-style: italic; color: var(--m3-sys-color-on-surface-variant);">
        ${goal.GoalDescription}
      </p>
    `;
    goalDisplay.style.display = 'block';
  }
  updateAddEditGoalIcon();
}

function updateAddEditGoalIcon() {
  const iconEl = document.getElementById('addEditGoalIcon');
  if (!iconEl) return; 
  if (selectedGoal) {
    iconEl.innerHTML = `<span class="material-symbols-outlined">edit</span>`;
    iconEl.title = 'Edit Selected Goal';
    iconEl.onclick = () => openGoalModal(selectedGoal); 
  } else {
    iconEl.innerHTML = `<span class="material-symbols-outlined">add_circle</span>`;
    iconEl.title = 'Add New Goal';
    iconEl.onclick = () => openGoalModal(null); 
  }
}


/* ======================================================================= *
 * GOAL MODAL MODULE
 * ======================================================================= */
function openGoalModal(goalData = null) {
  if (!selectedStudent) return;
  const modal = document.getElementById('goalModal');
  const form = document.getElementById('goalForm');
  form.reset();
  document.getElementById('goalStudentId').value = selectedStudent.StudentID;
  if (goalData && goalData.GoalID) {
    document.getElementById('goalModalTitle').textContent = `Edit Goal`;
    document.getElementById('goalId').value = goalData.GoalID;
    document.getElementById('goalTitle').value = goalData.GoalTitle;
    document.getElementById('goalDescription').value = goalData.GoalDescription;
    document.querySelector(`input[name="goalCategory"][value="${goalData.GoalCategory}"]`).checked = true;
    document.getElementById('goalActive').checked = goalData.Active;
  } else {
    document.getElementById('goalModalTitle').textContent = `Add New Goal`;
    document.getElementById('goalId').value = '';
  }
  modal.style.display = 'flex';
}

function closeGoalModal() {
  document.getElementById('goalModal').style.display = 'none';
}

async function handleGoalFormSubmit(event) {
  event.preventDefault(); 
  const saveBtn = document.getElementById('saveGoalBtn');
  saveBtn.disabled = true;
  const goalData = {
    GoalID: document.getElementById('goalId').value,
    StudentID: document.getElementById('goalStudentId').value,
    GoalTitle: document.getElementById('goalTitle').value.trim(),
    GoalDescription: document.getElementById('goalDescription').value.trim(),
    GoalCategory: document.querySelector('input[name="goalCategory"]:checked').value,
    Active: document.getElementById('goalActive').checked
  };
  
  const result = await apiRequest('saveGoalRecord', goalData, false);
  if (result) {
    closeGoalModal();
    await selectStudent(selectedStudent);
  }
  saveBtn.disabled = false;
}


/* ======================================================================= *
 * TAG MODULE
 * ======================================================================= */
function renderTagSelection(showAll = false) {
  const container = document.getElementById('tag-chips-area');
  container.innerHTML = '';
  const tagsToShow = showAll ? allTags : allTags.slice(0, 3);
  tagsToShow.forEach(tag => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.textContent = tag.TagName;
    chip.dataset.tagId = tag.TagID;
    if (selectedTagIds.has(tag.TagID)) chip.classList.add('selected');
    chip.onclick = () => handleTagClick(tag.TagID, chip);
    container.appendChild(chip);
  });
  if (!showAll && allTags.length > 3) {
    const expandBtn = document.createElement('div');
    expandBtn.className = 'tag-chip control-chip';
    expandBtn.innerHTML = `Show All ${allTags.length} <span class="material-symbols-outlined" style="font-size: 1em; margin-left: 4px;">expand_more</span>`;
    expandBtn.onclick = () => renderTagSelection(true);
    container.appendChild(expandBtn);
  }
  const addBtn = document.createElement('div');
  addBtn.className = 'tag-chip control-chip';
  addBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1em;">add</span>`;
  addBtn.onclick = openTagModal;
  container.appendChild(addBtn);
}

function handleTagClick(tagId, chipElement) {
  if (selectedTagIds.has(tagId)) {
    selectedTagIds.delete(tagId);
    chipElement.classList.remove('selected');
  } else {
    selectedTagIds.add(tagId);
    chipElement.classList.add('selected');
  }
}


/* ======================================================================= *
 * TAG MODAL MODULE
 * ======================================================================= */
function openTagModal() {
  document.getElementById('tagForm').reset();
  document.getElementById('tagModal').style.display = 'flex';
}

function closeTagModal() {
  document.getElementById('tagModal').style.display = 'none';
}

async function handleTagFormSubmit(event) {
  event.preventDefault();
  const saveBtn = document.getElementById('saveTagBtn');
  saveBtn.disabled = true;
  const tagData = {
    tagName: document.getElementById('tagName').value.trim(),
    tagDescription: document.getElementById('tagDescription').value.trim()
  };
  
  const newTag = await apiRequest('saveNewTag', tagData, false);
  if (newTag) {
    allTags.push(newTag);
    renderTagSelection(true);
    closeTagModal();
  }
  saveBtn.disabled = false;
}


/* ======================================================================= *
 * SUCCESS MODAL MODULE
 * ======================================================================= */
function showSuccessModal() {
  document.getElementById('successModal').style.display = 'flex'; 
}

async function closeSuccessModal() {
  document.getElementById('successModal').style.display = 'none';
  if (selectedGoal) {
      document.querySelector(`.goal-button.selected`)?.classList.remove('selected');
  }
  selectedGoal = null; 
  document.getElementById('selected-goal-display').style.display = 'none'; 
  updateAddEditGoalIcon();
  selectedTagIds.clear();
  renderTagSelection();
  if (selectedStudent) await selectStudent(selectedStudent);
}


/* ======================================================================= *
 * REPORT RENDERING MODULE
 * ======================================================================= */
function displayReport(observations) {
  const reportContentDiv = document.getElementById('student-report-content');
  reportContentDiv.innerHTML = ''; 

  if (!observations || observations.length === 0) {
    reportContentDiv.innerHTML = '<p>No observations found for this student.</p>';
    renderReportTagSummary(observations);
    return;
  }
  
  document.getElementById('copyReportIcon').style.display = 'inline-flex';
  document.getElementById('downloadPdfIcon').style.display = 'inline-flex';

  const groupedByGoal = observations.reduce((acc, obs) => {
    const key = (obs.GoalID && obs.GoalTitle) ? obs.GoalTitle : 'General Notes';
    if (!acc[key]) acc[key] = { observations: [], description: obs.GoalDescription || '' };
    acc[key].observations.push(obs);
    return acc;
  }, {});

  const sortedGroupKeys = Object.keys(groupedByGoal).sort((a,b) => a === 'General Notes' ? 1 : b === 'General Notes' ? -1 : a.localeCompare(b));

  sortedGroupKeys.forEach(groupName => {
    const group = groupedByGoal[groupName];
    const isGeneral = groupName === 'General Notes';
    const groupId = `group-${groupName.replace(/[^a-zA-Z0-9]/g, '')}`;
    
    const groupDiv = document.createElement('div');
    groupDiv.className = 'report-group';
    groupDiv.id = groupId;
    
    const groupHeaderDiv = document.createElement('div');
    groupHeaderDiv.className = 'report-group-header';
    const header = document.createElement('h3');
    header.textContent = groupName;
    groupHeaderDiv.appendChild(header);
    
    if (!isGeneral && group.description) {
      const descP = document.createElement('p');
      descP.className = 'goal-description-header';
      descP.textContent = group.description;
      groupHeaderDiv.appendChild(descP);
    }
    groupDiv.appendChild(groupHeaderDiv);

    group.observations.forEach((obs, index) => {
      const obsDiv = createReportEntryDiv(obs);
      const goalColor = goalColorMap.get(obs.GoalID);
      if (goalColor) {
        obsDiv.style.borderLeft = `4px solid ${goalColor}`;
      } else if (isGeneral) {
         obsDiv.classList.add('general-note');
      }
      if (index >= INITIAL_OBSERVATION_LIMIT && !obs.HiddenFromReport) {
        obsDiv.style.display = 'none';
      }
      groupDiv.appendChild(obsDiv);
    });

    const visibleCount = group.observations.filter(o => !o.HiddenFromReport).length;
    if (visibleCount > INITIAL_OBSERVATION_LIMIT) {
      const toggleButton = createToggleButton(groupId, visibleCount);
      groupDiv.appendChild(toggleButton);
    }
    reportContentDiv.appendChild(groupDiv);
  });
  
  renderReportTagSummary(observations);
}

function createReportEntryDiv(obs) {
  const obsDiv = document.createElement('div');
  obsDiv.className = 'report-entry';
  if (obs.HiddenFromReport) {
    obsDiv.classList.add('hidden-from-report');
  }
  obsDiv.id = `obs-${obs.ObservationID}`;
  const obsDate = new Date(obs.Timestamp); 
  const formattedDate = `${obsDate.getMonth() + 1}/${obsDate.getDate()}/${obsDate.getFullYear()}`;
  const teacherEmail = obs.TeacherEmail || '';
  const initials = getInitialsFromEmail(teacherEmail);
  
  obsDiv.innerHTML = `
    <div class="report-entry-header">
      <div class="timestamp-line">
        <span class="timestamp">${formattedDate}</span>
        ${initials ? `<span class="teacher-initials" title="${teacherEmail}">${initials}</span>` : ''}
      </div>
      <button class="options-button icon-button" onclick="toggleReportOptionsMenu(event, '${obs.ObservationID}')">
        <span class="material-symbols-outlined">more_vert</span>
      </button>
    </div>
    <div class="observation-text">${obs.ObservationNote}</div>
  `;
  
  const tagIds = obs.TagIDs ? String(obs.TagIDs).split(',') : [];
  if (tagIds.length > 0 && tagIds[0] !== "") {
      const tagsHtml = tagIds.map(id => {
          const tag = allTags.find(t => t.TagID === id);
          return tag ? `<div class="report-entry-tag">${tag.TagName}</div>` : '';
      }).join('');
      
      if (tagsHtml) {
          const tagsContainer = document.createElement('div');
          tagsContainer.className = 'report-entry-tags';
          tagsContainer.innerHTML = tagsHtml;
          obsDiv.appendChild(tagsContainer);
      }
  }

  const optionsMenu = document.createElement('div');
  optionsMenu.id = `options-menu-${obs.ObservationID}`;
  optionsMenu.className = 'options-menu';
  optionsMenu.innerHTML = `
    <button class="hide-button" onclick="hideObservationFromReport('${obs.ObservationID}', ${!obs.HiddenFromReport})">
      ${obs.HiddenFromReport ? 'Show in Report' : 'Hide from Report'}
    </button>
    <button class="delete-button" onclick="deleteObservation('${obs.ObservationID}')">Delete</button>
  `;
  obsDiv.appendChild(optionsMenu);

  return obsDiv;
}


/* ======================================================================= *
 * REPORT INTERACTION MODULE
 * ======================================================================= */
function createToggleButton(groupId, totalVisible) {
  const toggleButton = document.createElement('button');
  toggleButton.className = 'toggle-visibility-button'; 
  toggleButton.textContent = `Show All ${totalVisible} Entries (${totalVisible - INITIAL_OBSERVATION_LIMIT} more)`;
  toggleButton.onclick = () => toggleReportGroupVisibility(groupId, toggleButton, totalVisible);
  return toggleButton;
}

function toggleReportGroupVisibility(groupId, buttonElement, totalVisible) {
  const groupDiv = document.getElementById(groupId);
  if (!groupDiv) return;
  const observations = Array.from(groupDiv.querySelectorAll('.report-entry:not(.hidden-from-report)'));
  const isExpanded = observations.some((obs, i) => i >= INITIAL_OBSERVATION_LIMIT && obs.style.display !== 'none');

  if (isExpanded) {
    observations.forEach((obsDiv, i) => { if (i >= INITIAL_OBSERVATION_LIMIT) obsDiv.style.display = 'none'; });
    buttonElement.textContent = `Show All ${totalVisible} Entries (${totalVisible - INITIAL_OBSERVATION_LIMIT} more)`;
  } else {
    observations.forEach(obsDiv => { obsDiv.style.display = 'flex'; });
    buttonElement.textContent = 'Show Less';
  }
}

function toggleReportOptionsMenu(event, observationId) {
  event.stopPropagation(); 
  const menu = document.getElementById(`options-menu-${observationId}`);
  if (!menu) return;
  document.querySelectorAll('.options-menu').forEach(m => { if (m.id !== menu.id) m.style.display = 'none'; });
  menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex'; 
}

async function hideObservationFromReport(observationId, hideStatus) {
  await apiRequest('updateHiddenStatus', { observationId: observationId, isHidden: hideStatus });
  await selectStudent(selectedStudent);
}

async function deleteObservation(observationId) {
  if (window.confirm('Are you sure you want to permanently delete this observation?')) {
    await apiRequest('deleteObservation', { observationId: observationId });
    await selectStudent(selectedStudent);
  }
}

function renderReportTagSummary(observations) {
  const summaryContainer = document.getElementById('report-tag-summary');
  const summaryContent = document.getElementById('report-tag-summary-content');
  summaryContent.innerHTML = '';
  
  const tagCounts = new Map();
  observations.forEach(obs => {
    const tagIds = obs.TagIDs ? String(obs.TagIDs).split(',') : [];
    tagIds.forEach(id => {
      if(id) tagCounts.set(id, (tagCounts.get(id) || 0) + 1);
    });
  });

  if (tagCounts.size === 0) {
    summaryContainer.style.display = 'none';
    return;
  }
  
  summaryContainer.style.display = 'block';
  
  tagCounts.forEach((count, tagId) => {
    const tag = allTags.find(t => t.TagID === tagId);
    if (tag) {
      const chip = document.createElement('div');
      chip.className = 'tag-chip summary-tag-item';
      chip.innerHTML = `${tag.TagName}<span class="tag-count">${count}</span>`;
      chip.onclick = () => filterReportByTag(tagId, chip);
      summaryContent.appendChild(chip);
    }
  });
}

function filterReportByTag(tagId, chipElement) {
  document.querySelectorAll('.summary-tag-item').forEach(c => c.classList.remove('filtered'));
  chipElement.classList.add('filtered');

  document.querySelectorAll('.report-group').forEach(group => {
      let groupHasVisibleEntry = false;
      group.querySelectorAll('.report-entry').forEach(entry => {
          const obs = currentReportObservations.find(o => `obs-${o.ObservationID}` === entry.id);
          if (obs && obs.TagIDs && String(obs.TagIDs).split(',').includes(tagId)) {
              entry.style.display = 'flex';
              groupHasVisibleEntry = true;
          } else {
              entry.style.display = 'none';
          }
      });
      group.style.display = groupHasVisibleEntry ? 'block' : 'none';
  });
  document.getElementById('reset-filter-btn').style.display = 'inline-block';
}

function resetReportFilter() {
  document.querySelectorAll('.summary-tag-item').forEach(c => c.classList.remove('filtered'));
  document.querySelectorAll('.report-group').forEach(g => g.style.display = 'block');
  displayReport(currentReportObservations);
  document.getElementById('reset-filter-btn').style.display = 'none';
}


/* ======================================================================= *
 * REPORT EXPORT MODULE
 * ======================================================================= */
async function copyReportContent() {
  if (!selectedStudent || !currentReportObservations) return;
  const visibleObservations = currentReportObservations.filter(obs => !obs.HiddenFromReport);
  if (visibleObservations.length === 0) {
    document.getElementById('app-status').textContent = 'No visible content to copy.';
    setTimeout(() => { document.getElementById('app-status').textContent = ''; }, 3000);
    return;
  }

  let textToCopy = `Report for ${selectedStudent.FirstName} ${selectedStudent.LastName}\n\n`;
  const grouped = visibleObservations.reduce((acc, obs) => {
      const key = obs.GoalTitle || "General Notes";
      if (!acc[key]) acc[key] = { observations: [], description: obs.GoalDescription || '' };
      acc[key].observations.push(obs);
      return acc;
  }, {});

  for (const groupName in grouped) {
      textToCopy += `--- ${groupName} ---\n`;
      if (grouped[groupName].description) {
        textToCopy += `Description: ${grouped[groupName].description}\n`;
      }
      grouped[groupName].observations.sort((a,b) => new Date(a.Timestamp) - new Date(b.Timestamp)).forEach(obs => {
          const obsDate = new Date(obs.Timestamp); 
          const formattedDate = `${obsDate.getMonth() + 1}/${obsDate.getDate()}/${obsDate.getFullYear()}`;
          textToCopy += `  Date: ${formattedDate} (${getInitialsFromEmail(obs.TeacherEmail)})\n`; 
          textToCopy += `  Observation: ${obs.ObservationNote}\n\n`;
      });
  }

  try {
    await navigator.clipboard.writeText(textToCopy);
    document.getElementById('app-status').textContent = 'Report copied to clipboard!';
  } catch (err) {
    handleError(err);
  } finally {
    setTimeout(() => { document.getElementById('app-status').textContent = ''; }, 3000); 
  }
}

async function downloadReportAsPdf() {
  if (!selectedStudent || !currentReportObservations) return;
  const reportContentDiv = document.getElementById('student-report-content');
  document.getElementById('app-status').textContent = 'Generating PDF...';

  const originalDisplayStates = [];
  reportContentDiv.querySelectorAll('.report-entry:not(.hidden-from-report)').forEach(entry => {
      originalDisplayStates.push({el: entry, display: entry.style.display});
      entry.style.display = 'flex';
  });
  reportContentDiv.querySelectorAll('.toggle-visibility-button').forEach(btn => {
      originalDisplayStates.push({el: btn, display: btn.style.display});
      btn.style.display = 'none';
  });

  document.body.classList.add('pdf-rendering-mode'); 
  
  try {
    const canvas = await html2canvas(reportContentDiv, { scale: 2, useCORS: true });
    const { jsPDF } = window.jspdf; 
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'letter' }); 

    const pdfPageWidth = pdf.internal.pageSize.getWidth();
    const pdfPageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pdfPageWidth - (margin * 2);
    const canvasHeight = canvas.height;
    const canvasWidth = canvas.width;
    const contentHeight = (canvasHeight * contentWidth) / canvasWidth;
    
    let heightLeft = contentHeight;
    let position = margin + 10;

    pdf.setFontSize(18).text(`Report for: ${selectedStudent.FirstName} ${selectedStudent.LastName}`, margin, margin);
    pdf.setFontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`, margin, margin + 6);
    
    pdf.addImage(canvas, 'PNG', margin, position, contentWidth, contentHeight);
    heightLeft -= (pdfPageHeight - position);

    while (heightLeft > 0) {
      position = heightLeft - contentHeight;
      pdf.addPage();
      pdf.addImage(canvas, 'PNG', margin, position, contentWidth, contentHeight);
      heightLeft -= pdfPageHeight;
    }
    
    pdf.save(`Report_${selectedStudent.FirstName}_${selectedStudent.LastName}.pdf`);
    document.getElementById('app-status').textContent = 'PDF generated!';
  } catch (err) {
    handleError(err);
  } finally {
      document.body.classList.remove('pdf-rendering-mode');
      originalDisplayStates.forEach(item => { if(item.el) item.el.style.display = item.display; });
      setTimeout(() => { document.getElementById('app-status').textContent = ''; }, 5000);
  }
}


/* ======================================================================= *
 * UTILITIES
 * ======================================================================= */
function getInitialsFromEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const namePart = email.split('@')[0];
  const parts = namePart.split(/[\._ ]+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return parts.map(part => part[0]).join('').toUpperCase();
}

function handleError(error) {
  console.error("An error occurred:", error);
  document.getElementById('app-status').textContent = `Error: ${error.message}`;
}
</script>
