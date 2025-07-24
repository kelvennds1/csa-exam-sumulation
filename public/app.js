const SUPABASE_URL = "__SUPABASE_URL__";
const SUPABASE_ANON_KEY = "__SUPABASE_ANON_KEY__";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const app = document.getElementById("app");

let currentUser = null;
let allQuestions = [];
let currentQuestions = [];
let currentQuestionIndex = 0;
let userAnswers = {};
let examTimer = null;
let userHistory = [];
let currentExamSource = "Random";
let timeRemaining = 5400;
let flaggedQuestions = new Set();



/**
 * @param {string} routeName - The name of the screen to display.
 * @param {object} [data=null] - Optional data to pass to the screen (e.g., result data).
 */
function router(routeName, data = null) {
  app.innerHTML = "";
  let template;

  switch (routeName) {
    case "auth":
      template = document.getElementById("auth-template");
      app.appendChild(template.content.cloneNode(true));
      document.getElementById("login-form").addEventListener("submit", handleLogin);
      document.getElementById("register-form").addEventListener("submit", handleRegister);
      break;

    case "start":
      template = document.getElementById("start-screen-template");
      app.appendChild(template.content.cloneNode(true));
      break;
      
    case "source-select":
      template = document.getElementById("source-select-template");
      app.appendChild(template.content.cloneNode(true));
      displaySourceSelection();
      break;

    case "exam":
      template = document.getElementById("exam-screen-template");
      app.appendChild(template.content.cloneNode(true));
      break;

    case "results":
      template = document.getElementById("results-screen-template");
      app.appendChild(template.content.cloneNode(true));
      displayResults(data);
      break;

    case "history":
      template = document.getElementById("history-screen-template");
      app.appendChild(template.content.cloneNode(true));
      loadHistory();
      break;

    default:
      template = document.getElementById("auth-template");
      app.appendChild(template.content.cloneNode(true));
      document.getElementById("login-form").addEventListener("submit", handleLogin);
      document.getElementById("register-form").addEventListener("submit", handleRegister);
  }
}


async function handleLogin(event) {
  event.preventDefault();
  const form = event.target;
  const email = form.email.value;
  const password = form.password.value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    alert("Login Error: " + error.message);
  } else {
    currentUser = data.user;
    router("start");
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const form = event.target;
  const email = form.email.value;
  const password = form.password.value;

  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    alert("Registration Error: " + error.message);
  } else {
    alert("Registration successful! Please check your email to confirm your account.");
    form.reset();
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  router("auth");
}

async function checkSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    currentUser = data.session.user;
    router("start");
  } else {
    router("auth");
  }
}


const topics = {
  platform_overview: "Platform Overview and Navigation",
  instance_config: "Instance Configuration",
  collaboration: "Configuring Applications for Collaboration",
  self_service: "Self Service & Automation",
  database_security: "Database Management and Platform Security",
  migration_integration: "Data Migration and Integration",
};

const topicDistribution = {
  platform_overview: 6,
  instance_config: 10,
  collaboration: 19.5,
  self_service: 19.5,
  database_security: 30,
  migration_integration: 15,
};

async function loadAllQuestions() {
  if (allQuestions.length > 0) return;
  try {
    const response = await fetch("questions.json");
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    data.forEach(
      (q) => (q.options = q.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`))
    );
    allQuestions = data;
    console.log(`Loaded ${allQuestions.length} questions.`);
  } catch (err) {
    console.error("Error loading questions.json:", err);
    app.innerHTML = '<p style="color: red;">Failed to load exam questions. Please try reloading the page.</p>';
  }
}

function displaySourceSelection() {
  const sourceListContainer = document.getElementById("source-list");
  if (!sourceListContainer) return;

  const sources = [...new Set(allQuestions.map((q) => q.source_file))];
  sources.sort();

  let buttonsHtml = sources.map(source => 
    `<button class="source-select-button" onclick="startExam('${source}')">${source}</button>`
  ).join('');

  buttonsHtml += `<button class="source-select-button" onclick="startExam('Random')">All Sources (Random)</button>`;
  sourceListContainer.innerHTML = buttonsHtml;
}

function getQuestionsByTopicDistribution(totalQuestions) {
  const questionsByTopic = {};
  Object.keys(topicDistribution).forEach((topic) => {
    questionsByTopic[topic] = Math.round((topicDistribution[topic] / 100) * totalQuestions);
  });

  const currentTotal = Object.values(questionsByTopic).reduce((a, b) => a + b, 0);
  if (currentTotal !== totalQuestions) {
    const largestTopic = Object.keys(questionsByTopic).reduce((a, b) =>
      questionsByTopic[a] > questionsByTopic[b] ? a : b
    );
    questionsByTopic[largestTopic] += totalQuestions - currentTotal;
  }
  return questionsByTopic;
}

function getRandomQuestions(totalQuestions, sourceFilter = "Random") {
  let questionPool = allQuestions;

  if (sourceFilter && sourceFilter !== "Random") {
    questionPool = allQuestions.filter((q) => q.source_file === sourceFilter);
  }
  
  const totalAvailable = questionPool.length;
  const questionsToSelect = Math.min(totalQuestions, totalAvailable);

  if (sourceFilter !== 'Random') {
      return [...questionPool].sort(() => 0.5 - Math.random());
  }

  const questionsByTopicCount = getQuestionsByTopicDistribution(questionsToSelect);
  let selectedQuestions = [];
  const questionsByTopic = {};

  questionPool.forEach((q) => {
    if (!questionsByTopic[q.topic]) questionsByTopic[q.topic] = [];
    questionsByTopic[q.topic].push(q);
  });

  Object.keys(questionsByTopicCount).forEach((topic) => {
    const requiredCount = questionsByTopicCount[topic];
    const availableQuestions = questionsByTopic[topic] || [];
    const shuffled = [...availableQuestions].sort(() => 0.5 - Math.random());
    selectedQuestions.push(...shuffled.slice(0, Math.min(requiredCount, shuffled.length)));
  });

  return selectedQuestions.sort(() => 0.5 - Math.random());
}

function startExam(source = 'Random') {
    currentExamSource = source;
    
    router('exam'); 
    
    setTimeout(() => {
        const questionCount = (source === 'Random') ? 60 : 1000; 
        currentQuestions = getRandomQuestions(questionCount, source); 
        
        if (currentQuestions.length === 0) {
            alert(`No questions found for source: ${source}`);
            router('source-select');
            return;
        }

        currentQuestionIndex = 0;
        userAnswers = {};
        flaggedQuestions.clear();
        timeRemaining = 5400; 
        displayQuestion();
        startTimer();
    }, 0);
}

function displayQuestion() {
  const question = currentQuestions[currentQuestionIndex];
  const container = document.getElementById("questionContainer");
  const counter = document.getElementById("questionCounter");

  if (!container || !counter) return;

  counter.textContent = `Question ${currentQuestionIndex + 1} of ${currentQuestions.length} (Source: ${currentExamSource})`;
  const isSingleAnswer = question.correct.length === 1;
  const inputType = isSingleAnswer ? "radio" : "checkbox";

  let optionsHtml = question.options.map((option, index) => {
      const isSelected = userAnswers[currentQuestionIndex]?.includes(index);
      return `
        <li class="${isSelected ? "selected" : ""}" onclick="selectOption(${index})">
            <input type="${inputType}" name="question_${currentQuestionIndex}" ${isSelected ? "checked" : ""} style="margin-right: 10px; accent-color: #2c5aa0;">
            ${option}
        </li>`;
    }).join("");

  const instructionText = isSingleAnswer
    ? '<p style="font-style: italic; color: #666;">Select one answer:</p>'
    : '<p style="font-style: italic; color: #666;">Select all that apply:</p>';

  container.innerHTML = `
    <div class="question">
        <div class="topic-indicator">${topics[question.topic] || question.topic}</div>
        <h3>Question ${currentQuestionIndex + 1}</h3>
        <p><b>${question.question}</b></p>
        ${instructionText}
        <ul class="options">${optionsHtml}</ul>
        <button id="flagButton" class="btn-secondary ${flaggedQuestions.has(currentQuestionIndex) ? "marked" : ""}" onclick="toggleFlag()">
            ${flaggedQuestions.has(currentQuestionIndex) ? "Unmark" : "Mark"} Question
        </button>
    </div>`;

  updateNavigation();
  updateQuestionNavigator();
}

function selectOption(optionIndex) {
  const question = currentQuestions[currentQuestionIndex];
  const isSingleAnswer = question.correct.length === 1;

  if (!userAnswers[currentQuestionIndex]) {
    userAnswers[currentQuestionIndex] = [];
  }

  const answerArray = userAnswers[currentQuestionIndex];
  const indexInAnswer = answerArray.indexOf(optionIndex);

  if (isSingleAnswer) {
    userAnswers[currentQuestionIndex] = [optionIndex];
  } else {
    if (indexInAnswer > -1) {
      answerArray.splice(indexInAnswer, 1);
    } else {
      answerArray.push(optionIndex);
    }
  }
  displayQuestion();
}

function submitExam() {
  clearInterval(examTimer);

  let correctAnswersCount = 0;
  const detailedAnswers = [];
  const topicResults = {};
  Object.keys(topics).forEach((key) => {
    topicResults[key] = { name: topics[key], total: 0, correct: 0, errors: 0 };
  });

  currentQuestions.forEach((q, i) => {
    const userAnswer = userAnswers[i]?.sort() || [];
    const correctAnswer = q.correct.sort();
    const isCorrect = JSON.stringify(userAnswer) === JSON.stringify(correctAnswer);

    if (topicResults[q.topic]) {
      topicResults[q.topic].total++;
      if (isCorrect) {
        topicResults[q.topic].correct++;
        correctAnswersCount++;
      } else {
        topicResults[q.topic].errors++;
      }
    }

    detailedAnswers.push({
      question: q.question,
      options: q.options,
      userAnswer: userAnswer,
      correctAnswer: correctAnswer,
      isCorrect: isCorrect,
      topic: topics[q.topic],
    });
  });

  const score = currentQuestions.length > 0 ? Math.round((correctAnswersCount / currentQuestions.length) * 100) : 0;
  const timeUsed = 5400 - timeRemaining;

  const resultPayload = {
    score_percent: score,
    duration_seconds: timeUsed,
    errors_by_topic: topicResults,
    answers_detail: detailedAnswers,
  };

  saveResult(resultPayload);
}

function nextQuestion() {
  if (currentQuestionIndex < currentQuestions.length - 1) {
    currentQuestionIndex++;
    displayQuestion();
  }
}

function previousQuestion() {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    displayQuestion();
  }
}

function toggleDetails() {
  const detailsDiv = document.getElementById("resultDetails");
  const toggleButton = document.getElementById("toggle-details-button");
  if (!detailsDiv || !toggleButton) return;

  const currentDisplay = window.getComputedStyle(detailsDiv).display;
  if (currentDisplay === "none") {
    detailsDiv.style.display = "block";
    toggleButton.textContent = "Hide Question Details";
  } else {
    detailsDiv.style.display = "none";
    toggleButton.textContent = "Show Question Details";
  }
}

function updateNavigation() {
  const prevBtn = document.getElementById("prevButton");
  const nextBtn = document.getElementById("nextButton");
  const submitBtn = document.getElementById("submitButton");
  if (!prevBtn || !nextBtn || !submitBtn) return;
  
  prevBtn.disabled = currentQuestionIndex === 0;
  nextBtn.style.display = currentQuestionIndex === currentQuestions.length - 1 ? "none" : "inline-block";
  submitBtn.style.display = currentQuestionIndex === currentQuestions.length - 1 ? "inline-block" : "none";
}

function updateQuestionNavigator() {
  const nav = document.getElementById("questionNavigator");
  if (!nav) return;
  nav.innerHTML = "";
  for (let i = 0; i < currentQuestions.length; i++) {
    const btn = document.createElement("button");
    btn.textContent = i + 1;
    btn.onclick = () => goToQuestion(i);
    if (i === currentQuestionIndex) btn.classList.add("current");
    if (userAnswers[i] && userAnswers[i].length > 0) btn.classList.add("answered");
    if (flaggedQuestions.has(i)) btn.classList.add("flagged");
    nav.appendChild(btn);
  }
}

function toggleFlag() {
  if (flaggedQuestions.has(currentQuestionIndex)) {
    flaggedQuestions.delete(currentQuestionIndex);
  } else {
    flaggedQuestions.add(currentQuestionIndex);
  }
  displayQuestion();
}

function goToQuestion(index) {
  currentQuestionIndex = index;
  displayQuestion();
}

function startTimer() {
  clearInterval(examTimer);
  examTimer = setInterval(function () {
    timeRemaining--;
    updateTimerDisplay();
    if (timeRemaining <= 0) {
      clearInterval(examTimer);
      alert("Time is up! The exam will be submitted automatically.");
      submitExam();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const timerElement = document.getElementById("timer");
  if (!timerElement) return;
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  timerElement.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  timerElement.className = "timer";
  if (timeRemaining <= 300) {
    timerElement.classList.add("critical");
  } else if (timeRemaining <= 900) {
    timerElement.classList.add("warning");
  }
}

async function saveResult(resultData) {
  if (!currentUser) {
    alert("You must be logged in to save your result.");
    router("results", resultData);
    return;
  }

  const payload = {
    user_id: currentUser.id,
    duration_seconds: resultData.duration_seconds,
    score_percent: resultData.score_percent,
    errors_by_topic: resultData.errors_by_topic,
    answers_detail: resultData.answers_detail,
    source_file: currentExamSource
  };

  const { data, error } = await supabaseClient.from("results").insert([payload]).select();

  if (error) {
    console.error("Error saving result:", error);
    alert("There was an error saving your result. Details will be shown, but will not be saved to your history.");
    router("results", { ...resultData, ...payload });
  } else {
    console.log("Result saved successfully:", data[0]);
    router("results", data[0]);
  }
}

function showHistoryDetail(index) {
  const resultData = userHistory[index];
  if (resultData) {
    router("results", resultData);
  } else {
    console.error("Could not find history data for index:", index);
  }
}

async function loadHistory() {
  if (!currentUser) return;
  const historyListContainer = document.getElementById("history-list");
  historyListContainer.innerHTML = "<p>Loading history...</p>";

  const { data, error } = await supabaseClient
    .from("results")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("submitted_at", { ascending: false });

  if (error) {
    historyListContainer.innerHTML = `<p style="color:red;">Error loading history: ${error.message}</p>`;
    return;
  }

  if (data.length === 0) {
    historyListContainer.innerHTML = "<p>You have not completed any exams yet.</p>";
    return;
  }

  userHistory = data;
  historyListContainer.innerHTML = userHistory.map((result, index) => `
      <div class="history-item ${result.score_percent >= 70 ? "good" : "needs-improvement"}">
        <p><strong>Date:</strong> ${new Date(result.submitted_at).toLocaleString()}</p>
        <p><strong>Score:</strong> <span class="score">${result.score_percent}%</span></p>
        <p><strong>Duration:</strong> ${Math.floor(result.duration_seconds / 60)}m ${result.duration_seconds % 60}s</p>
        <p><strong>Source:</strong> ${result.source_file || 'Random'}</p>
        <button class="details-button" onclick="showHistoryDetail(${index})">See Details</button>
      </div>`
    ).join("");
}

function displayResults(resultData) {
  const scoreDisplay = document.getElementById("scoreDisplay");
  const resultMessage = document.getElementById("resultMessage");
  const topicStats = document.getElementById("topicStats");

  if (!scoreDisplay || !resultMessage || !topicStats) return;

  scoreDisplay.textContent = `${resultData.score_percent}%`;
  const passed = resultData.score_percent >= 70;
  resultMessage.innerHTML = `
    <p>You answered ${Math.round((resultData.score_percent / 100) * resultData.answers_detail.length)} out of ${resultData.answers_detail.length} questions correctly.</p>
    <p style="font-size: 1.2em; color: ${passed ? "#4caf50" : "#f44336"};">
        ${passed ? "PASSED!" : "FAILED"}
    </p>`;

  topicStats.innerHTML = Object.values(resultData.errors_by_topic).map((topic) => {
      if (topic.total === 0) return "";
      const percentage = topic.total > 0 ? Math.round((topic.correct / topic.total) * 100) : 0;
      return `
        <div class="topic-stats ${percentage >= 70 ? "good" : "needs-improvement"}">
            <strong>${topic.name}</strong>: ${topic.correct}/${topic.total} (${percentage}%)
        </div>`;
    }).join("");

  generateErrorChart(resultData.errors_by_topic);

  const resultDetails = document.getElementById("resultDetails");
  resultDetails.innerHTML = resultData.answers_detail.map((item, index) => {
      const userOptions = item.userAnswer.map((i) => item.options[i]).join(", ") || "Not answered";
      const correctOptions = item.correctAnswer.map((i) => item.options[i]).join(", ");
      return `
        <div class="question-review ${item.isCorrect ? "correct" : "incorrect"}">
            <div class="topic-indicator">${item.topic}</div>
            <strong>Question ${index + 1}:</strong> ${item.question}<br>
            <strong>Your Answer:</strong> ${userOptions}<br>
            <strong>Correct Answer:</strong> ${correctOptions}
        </div>`;
    }).join("");
}

function generateErrorChart(topicResults) {
  const chartCtx = document.getElementById("errorChart")?.getContext("2d");
  if (!chartCtx) return;

  const topicsWithErrors = Object.values(topicResults).filter((topic) => topic.errors > 0);
  if (topicsWithErrors.length === 0) {
    const chartContainer = document.querySelector('.chart-container');
    if(chartContainer) chartContainer.innerHTML = '<h3>No Errors - Perfect Score!</h3>';
    return;
  }

  const labels = topicsWithErrors.map((topic) => topic.name);
  const data = topicsWithErrors.map((topic) => topic.errors);
  const colors = ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40"];

  // Destroy previous chart instance if it exists
  if(window.myErrorChart) {
    window.myErrorChart.destroy();
  }

  window.myErrorChart = new Chart(chartCtx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
          data: data,
          backgroundColor: colors.slice(0, data.length),
          borderWidth: 1,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, padding: 15 } }
      }
    }
  });
}


document.addEventListener("DOMContentLoaded", async () => {
  await loadAllQuestions();
  checkSession();
});