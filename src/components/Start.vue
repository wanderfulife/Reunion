<template>
	<div class="app-container">
		<!-- Progress Bar -->
		<div v-if="currentStep === 'survey'" class="progress-bar">
			<div class="progress" :style="{ width: `${progress}%` }"></div>
		</div>

		<div class="content-container">
			<!-- Enqueteur Input Step -->
			<div v-if="currentStep === 'enqueteur'">
				<h2>Prénom enqueteur :</h2>
				<input class="form-control" type="text" v-model="enqueteur" />
				<button v-if="enqueteur && !isEnqueteurSaved" @click="setEnqueteur" class="btn-next">Suivant</button>
			</div>

			<!-- Start Survey Step -->
			<div v-else-if="currentStep === 'start'" class="start-survey-container">
				<button @click="startSurvey" class="btn-next">COMMENCER QUESTIONNAIRE</button>
			</div>

			<!-- Eligibility Check Step -->
			<div v-else-if="currentStep === 'eligibility'" class="start-survey-container">
				<h2>Questionnaire mobilité Réunion</h2>
				<p>Bonjour, je réalise une enquête auprès des bénéficiaires du RSA qui habitent à la Réunion pour le
					compte du Département...</p>
				<p>Nous nous intéressons en particulier aux habitudes de déplacement des bénéficiaires du RSA. Etes-vous
					dans ce cas ?</p>
				<button @click="checkEligibility(true)" class="btn-next">OUI</button>
				<button @click="checkEligibility(false)" class="btn-end">NON</button>
			</div>

			<!-- Location Selection Step -->
			<div v-else-if="currentStep === 'location'">
				<h2>Lieu de passation du questionnaire :</h2>
				<select v-model="selectedLocation" class="form-control">
					<option value="">Sélectionnez une commune</option>
					<option v-for="commune in passation" :key="`${commune.commune}`"
						:value="commune">
						{{ commune.commune }}
					</option>
				</select>
				<button @click="setLocation" class="btn-next" :disabled="!selectedLocation">Suivant</button>
			</div>

			<!-- Survey Questions Step -->
			<div v-else-if="currentStep === 'survey' && !isSurveyComplete">
				<div class="question-container">
					<h2>{{ currentQuestion.text }}</h2>

					<!-- Multiple Choice Questions -->
					<div v-if="currentQuestion.type === 'multipleChoice'">
						<div v-for="(option, index) in currentQuestion.options" :key="index" class="checkbox-option">
							<input type="checkbox" :id="'option-' + currentQuestion.id + '-' + index"
								:name="currentQuestion.id" :checked="isOptionSelected(currentQuestion.id, option.value)"
								@change="selectAnswer(currentQuestion.id, option.value)">
							<label :for="'option-' + currentQuestion.id + '-' + index">{{ option.text }}</label>
						</div>
					</div>

					<!-- Single Choice Questions -->
					<div v-if="currentQuestion.type === 'singleChoice'">
						<select v-model="answers[currentQuestion.id]" class="form-control">
							<option value="">Sélectionnez une option</option>
							<option v-for="(option, index) in getQuestionOptions(currentQuestion)" :key="index"
								:value="option.value">
								{{ option.text }}
							</option>
						</select>
					</div>

					<!-- Text Input for Precision Questions -->
					<div v-else-if="currentQuestion.type === 'text'">
						<input type="text" v-model="answers[currentQuestion.id]" class="form-control">
					</div>

					<!-- Number Input Question -->
					<div v-else-if="currentQuestion.type === 'number'">
						<input type="number" v-model="answers[currentQuestion.id]"
							:placeholder="currentQuestion.placeholder" class="form-control">
					</div>

					<!-- Dropdown Question -->
					<div v-else-if="currentQuestion.type === 'dropdown'">
						<select v-model="answers[currentQuestion.id]" class="form-control">
							<option value="">Sélectionnez une option</option>
							<option v-for="(option, index) in currentQuestion.options" :key="index"
								:value="option.value">
								{{ option.text }}
							</option>
						</select>
					</div>

					<!-- Multiple Choice with Count Question -->
					<div v-else-if="currentQuestion.type === 'multipleChoiceWithCount'">
						<div v-for="(option, index) in currentQuestion.options" :key="index" class="count-option">
							<label>{{ option.text }}</label>
							<input type="number" v-model.number="answers[currentQuestion.id][option.value]" min="0"
								class="form-control">
						</div>
					</div>

					<!-- Navigation Buttons -->
					<div class="navigation-buttons">
						<button @click="nextQuestion" class="btn-next" :disabled="!isAnswerValid">Suivant</button>
						<button @click="previousQuestion" class="btn-return" v-if="canGoBack">Retour</button>
						<button @click="returnToLocation" class="btn-return" v-if="currentQuestion.id === 'Q1'">Retour</button>
					</div>
				</div>
			</div>

			<!-- Survey Complete Step -->
			<div v-else-if="isSurveyComplete" class="survey-complete">
				<h2>Merci pour votre réponse et bonne journée.</h2>
				<button @click="resetSurvey" class="btn-next">Nouveau questionnaire</button>
			</div>

			<!-- Logo -->
			<img class="logo" src="../assets/logo.webp" alt="Logo Alyce">
		</div>

		<!-- Footer -->
		<div class="footer">
			<AdminDashboard />
			<div class="doc-count">Nombre de questionnaires : {{ docCount }}</div>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { db } from "../firebaseConfig";
import { collection, getDocs, addDoc } from "firebase/firestore";
import { doc, getDoc, setDoc } from "firebase/firestore";
import * as XLSX from "xlsx";
import { questions, passation } from './surveyQuestions.js';

import AdminDashboard from './AdminDashboard.vue';

// Refs
const docCount = ref(0);
const currentStep = ref('enqueteur');
const startDate = ref('');
const enqueteur = ref('');
const currentQuestionIndex = ref(0);
const answers = ref({});
const isEnqueteurSaved = ref(false);
const isSurveyComplete = ref(false);
const selectedLocation = ref(null);
const questionHistory = ref([]);

// Firestore refs
const surveyCollectionRef = collection(db, "ReunionSurvey");
const counterDocRef = doc(db, "counters", "reunionSurveyCounter");

// Computed properties
const currentQuestion = computed(() => {
	return currentQuestionIndex.value >= 0 && currentQuestionIndex.value < questions.length
		? questions[currentQuestionIndex.value]
		: null;
});


const isOptionSelected = (questionId, optionValue) => {
	if (currentQuestion.value.type === 'singleChoice') {
		return answers.value[questionId] === optionValue;
	} else if (currentQuestion.value.type === 'multipleChoice') {
		return Array.isArray(answers.value[questionId]) && answers.value[questionId].includes(optionValue);
	}
	return false;
};

const returnToLocation = () => {
	currentStep.value = 'location';
	currentQuestionIndex.value = -1; // Reset question index
	answers.value = {}; // Clear answers
	questionHistory.value = []; // Clear question history
};

const canGoBack = computed(() => currentQuestionIndex.value > 0);

const isLastQuestion = computed(() => currentQuestionIndex.value === questions.length - 1);

const progress = computed(() => {
	if (currentStep.value !== 'survey') return 0;
	if (isSurveyComplete.value) return 100;
	const totalQuestions = questions.length;
	const currentQuestionNumber = currentQuestionIndex.value + 1;
	return Math.min(Math.round((currentQuestionNumber / totalQuestions) * 100), 99);
});

const toggleOption = (questionId, optionValue) => {
	console.log('Toggling option:', questionId, optionValue);
	if (!Array.isArray(answers.value[questionId])) {
		answers.value[questionId] = [];
	}
	const index = answers.value[questionId].indexOf(optionValue);
	if (index === -1) {
		answers.value[questionId].push(optionValue);
	} else {
		answers.value[questionId].splice(index, 1);
	}
	console.log('Current answers:', JSON.parse(JSON.stringify(answers.value)));
};

// Methods
const setEnqueteur = () => {
	if (enqueteur.value.trim() !== '') {
		currentStep.value = 'start';
		isEnqueteurSaved.value = true;
	}
};

const startSurvey = () => {
	currentStep.value = 'eligibility';
};

const checkEligibility = async (isEligible) => {
	if (isEligible) {
		currentStep.value = 'location';
	} else {
		// Save "non" as RSA value
		const surveyData = {
			ID_questionnaire: await getNextId(),
			HEURE_DEBUT: new Date().toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
			DATE: new Date().toLocaleDateString("fr-FR").replace(/\//g, "-"),
			JOUR: new Date().toLocaleDateString("fr-FR", { weekday: 'long' }),
			ENQUETEUR: enqueteur.value,
			LIEU_PASSATION: "N/A",
			HEURE_FIN: new Date().toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
			RSA: "non"
		};

		try {
			await addDoc(collection(db, "ReunionSurvey"), surveyData);
			console.log('Non-eligible survey saved successfully');
			getDocCount();
		} catch (error) {
			console.error('Error saving non-eligible survey:', error);
		}

		// Stop the survey
		endSurvey();
	}
};

const setLocation = () => {
	if (selectedLocation.value) {
		startDate.value = new Date().toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		currentStep.value = 'survey';
		currentQuestionIndex.value = 0;
		answers.value = {};
		isSurveyComplete.value = false;
	}
};

const selectAnswer = (questionId, optionValue) => {
	const question = questions.find(q => q.id === questionId);
	if (!question) return;

	switch (question.type) {
		case 'multipleChoice':
			if (!Array.isArray(answers.value[questionId])) {
				answers.value[questionId] = [];
			}
			const index = answers.value[questionId].indexOf(optionValue);
			if (index === -1) {
				answers.value[questionId].push(optionValue);
			} else {
				answers.value[questionId].splice(index, 1);
			}
			// Clear answers for subsequent questions as they may no longer be valid
			Object.keys(answers.value).forEach(qId => {
				const qIndex = questions.findIndex(q => q.id === qId);
				if (qIndex > questions.findIndex(q => q.id === questionId)) {
					delete answers.value[qId];
				}
			});
			break;
		case 'singleChoice':
		case 'dropdown':
			answers.value[questionId] = optionValue;
			// Clear answers for subsequent questions as they may no longer be valid
			Object.keys(answers.value).forEach(qId => {
				const qIndex = questions.findIndex(q => q.id === qId);
				if (qIndex > questions.findIndex(q => q.id === questionId)) {
					delete answers.value[qId];
				}
			});
			break;
		case 'multipleChoiceWithCount':
			// This is handled by v-model in the template
			break;
		default:
			answers.value[questionId] = optionValue;
	}
};

const isAnswerValid = computed(() => {
	if (!currentQuestion.value) return false;

	const answer = answers.value[currentQuestion.value.id];

	switch (currentQuestion.value.type) {
		case 'singleChoice':
		case 'dropdown':
			return answer !== undefined && answer !== '';
		case 'multipleChoice':
			return Array.isArray(answer) && answer.length > 0;
		case 'number':
			return answer !== undefined && answer !== '' && !isNaN(answer);
		case 'multipleChoiceWithCount':
			if (currentQuestion.value.id === 'Q5') {
				// For Q5, consider it valid even if all values are 0
				return typeof answer === 'object' && Object.keys(answer).length > 0;
			} else {
				// For other multipleChoiceWithCount questions, keep the original logic
				return typeof answer === 'object' && Object.values(answer).some(count => count > 0);
			}
		case 'text':
			return answer !== undefined && answer.trim() !== '';
		default:
			return false;
	}
});

// New method to get question options
const getQuestionOptions = (question) => {
	if (question.id === 'Q12') {
		return question.options.map(option => ({
			...option,
			text: typeof option.text === 'function' ? option.text(selectedLocation.value) : option.text
		}));
	}
	return question.options;
};

const nextQuestion = () => {
	if (currentQuestion.value) {
		let nextQuestionId;
		if (typeof currentQuestion.value.nextQuestion === 'function') {
			nextQuestionId = currentQuestion.value.nextQuestion(answers.value);
		} else {
			nextQuestionId = currentQuestion.value.nextQuestion;
		}

		if (nextQuestionId === 'end') {
			finishSurvey();
		} else {
			const nextIndex = questions.findIndex(q => q.id === nextQuestionId);
			if (nextIndex !== -1) {
				// Only add to history if we're actually moving to a new question
				if (nextIndex !== currentQuestionIndex.value) {
					questionHistory.value.push(currentQuestionIndex.value);
					currentQuestionIndex.value = nextIndex;

					// Clear answers for all questions after the new current one
					Object.keys(answers.value).forEach(questionId => {
						const questionIndex = questions.findIndex(q => q.id === questionId);
						if (questionIndex > currentQuestionIndex.value) {
							delete answers.value[questionId];
						}
					});

					// Initialize the answer for the next question if it's multipleChoiceWithCount
					if (questions[nextIndex].type === 'multipleChoiceWithCount') {
						answers.value[questions[nextIndex].id] = {};
					}
				}
			} else {
				finishSurvey();
			}
		}
	} else {
		finishSurvey();
	}
};

const previousQuestion = () => {
	if (questionHistory.value.length > 0) {
		const previousIndex = questionHistory.value.pop();
		currentQuestionIndex.value = previousIndex;

		// Clear answers for all questions after the current one
		const currentQuestionId = questions[currentQuestionIndex.value].id;
		Object.keys(answers.value).forEach(questionId => {
			const questionIndex = questions.findIndex(q => q.id === questionId);
			if (questionIndex > currentQuestionIndex.value) {
				delete answers.value[questionId];
			}
		});

		// If the current question is a multiple choice, reset its answer
		if (questions[currentQuestionIndex.value].type === 'multipleChoice') {
			answers.value[currentQuestionId] = [];
		}
	}
};

const finishSurvey = async () => {
	const formattedAnswers = {};

	for (const [questionId, answer] of Object.entries(answers.value)) {
		const question = questions.find(q => q.id === questionId);
		if (!question) continue;

		switch (question.type) {
			case 'multipleChoice':
				formattedAnswers[questionId] = answer.map(optionValue => {
					return question.options.findIndex(opt => opt.value === optionValue) + 1;
				}).join(',');
				break;
			case 'singleChoice':
			case 'dropdown':
				const optionIndex = question.options.findIndex(opt => opt.value === answer);
				formattedAnswers[questionId] = optionIndex !== -1 ? (optionIndex + 1).toString() : '';
				break;
			case 'multipleChoiceWithCount':
				formattedAnswers[questionId] = Object.entries(answer)
					.filter(([_, count]) => count > 0)
					.map(([optionValue, count]) => {
						const optionIndex = question.options.findIndex(opt => opt.value === optionValue);
						return `${optionIndex + 1}:${count}`;
					}).join(',');
				break;
			case 'text':
			case 'number':
				formattedAnswers[questionId] = answer;
				break;
			default:
				formattedAnswers[questionId] = answer;
		}
	}

	const surveyData = {
		ID_questionnaire: await getNextId(),
		HEURE_DEBUT: startDate.value,
		DATE: new Date().toLocaleDateString("fr-FR").replace(/\//g, "-"),
		JOUR: new Date().toLocaleDateString("fr-FR", { weekday: 'long' }),
		ENQUETEUR: enqueteur.value,
		LIEU_PASSATION: selectedLocation.value.commune,
		HEURE_FIN: new Date().toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
		...formattedAnswers
	};

	try {
		await addDoc(collection(db, "ReunionSurvey"), surveyData);
		console.log('Survey saved successfully');
		getDocCount();
		isSurveyComplete.value = true;
	} catch (error) {
		console.error('Error saving survey:', error);
	}
};

const endSurvey = () => {
	console.log('Survey ended - respondent not eligible');
	resetSurvey();
};

const resetSurvey = () => {
	currentStep.value = 'start';
	startDate.value = "";
	answers.value = {};
	currentQuestionIndex.value = 0;
	selectedLocation.value = null;
	isSurveyComplete.value = false;
	questionHistory.value = [];
};

const getDocCount = async () => {
	try {
		const querySnapshot = await getDocs(surveyCollectionRef);
		docCount.value = querySnapshot.size;
	} catch (error) {
		console.error("Error getting document count:", error);
	}
};

const getNextId = async () => {
	const counterDoc = await getDoc(counterDocRef);
	let counter = 1;

	if (counterDoc.exists()) {
		counter = counterDoc.data().value + 1;
	}

	await setDoc(counterDocRef, { value: counter });

	return `REUNION-${counter.toString().padStart(6, '0')}`;
};

// Lifecycle hooks
onMounted(() => {
	getDocCount();
});
</script>

<style>
/* Base styles */
body {
	background-color: #2a3b63;
	margin: 0;
	padding: 0;
	font-family: Arial, sans-serif;
}

.app-container {
	display: flex;
	flex-direction: column;
	min-height: 100vh;
	background-color: #2a3b63;
	color: white;
}

/* Center the Start Survey button horizontally and vertically */
.start-survey-container {
	justify-content: center;
	align-items: center;
	height: 50vh;
	width: 100%;
	margin-bottom: 5%;
}

.content-container {
	flex-grow: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 5% 0;
	width: 90%;
	max-width: 600px;
	margin: 0 auto;
	box-sizing: border-box;
	overflow-y: auto;
}

.question-container {
	width: 100%;
	margin-bottom: 30px;
}

.input-container {
	display: flex;
	justify-content: center;
	width: 100%;
}

h2 {
	text-align: center;
	width: 100%;
}

.form-control {
	width: 100%;
	max-width: 400px;
	padding: 10px;
	border-radius: 5px;
	border: 1px solid white;
	background-color: #333;
	color: white;
	font-size: 16px;
	margin-bottom: 15px;
	box-sizing: border-box;
	outline: none;
}

.btn-next,
.btn-return,
.btn-end {
	width: 100%;
	max-width: 400px;
	color: white;
	padding: 15px;
	margin-top: 10px;
	border: none;
	border-radius: 5px;
	cursor: pointer;
	font-size: 16px;
}

.btn-next {
	background-color: green;
}

.btn-end {
	background-color: red;
}

.btn-return {
	background-color: grey;
	margin-top: 30px;
}

.logo {
	max-width: 25%;
	height: auto;
	margin-top: 40px;
	margin-bottom: 20px;
}

.footer {
	background: linear-gradient(to right, #4c4faf, #3f51b5);
	padding: 20px;
	text-align: center;
	width: 100%;
	box-sizing: border-box;
	position: relative;
}

.btn-download {
	background-color: #ffffff;
	color: #4c4faf;
	border: none;
	cursor: pointer;
	font-size: 16px;
	font-weight: bold;
	padding: 10px 20px;
	border-radius: 25px;
	transition: all 0.3s ease;
	margin-bottom: 15px;
	text-transform: uppercase;
	letter-spacing: 1px;
}

.doc-count {
	font-size: 14px;
	opacity: 0.9;
}

.progress-bar {
	width: 100%;
	height: 10px;
	background-color: #e0e0e0;
	position: relative;
	overflow: hidden;
	margin-bottom: 20px;
}

.progress {
	height: 100%;
	background-color: #4caf50;
	transition: width 0.3s ease-in-out;
}

/* Updated styles for multiple choice options */
.checkbox-option {
	margin-bottom: 15px;
	position: relative;
}

.checkbox-option input[type="checkbox"] {
	position: absolute;
	opacity: 0;
	cursor: pointer;
	height: 0;
	width: 0;
}

.checkbox-option label {
	display: block;
	position: relative;
	padding: 15px 15px 15px 50px;
	background-color: #4a5a83;
	color: white;
	border-radius: 10px;
	cursor: pointer;
	font-size: 16px;
	transition: all 0.3s ease;
	box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
}

.checkbox-option label:hover {
	background-color: #5b6b94;
	transform: translateY(-2px);
	box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.checkbox-option label:before {
	content: '';
	position: absolute;
	left: 15px;
	top: 50%;
	transform: translateY(-50%);
	width: 24px;
	height: 24px;
	border: 2px solid white;
	border-radius: 4px;
	background-color: transparent;
	transition: all 0.3s ease;
}

.checkbox-option input[type="checkbox"]:checked+label {
	background-color: #3f51b5;
	font-weight: bold;
}

.checkbox-option input[type="checkbox"]:checked+label:before {
	background-color: white;
	border-color: white;
}

.checkbox-option input[type="checkbox"]:checked+label:after {
	content: '✔';
	position: absolute;
	left: 22px;
	top: 50%;
	transform: translateY(-50%);
	color: #3f51b5;
	font-size: 16px;
	font-weight: bold;
}

/* Style adjustments for single choice options */
.form-control {
	appearance: none;
	-webkit-appearance: none;
	-moz-appearance: none;
	background-color: #4a5a83;
	color: white;
	padding: 15px;
	border-radius: 10px;
	border: none;
	font-size: 16px;
	cursor: pointer;
	transition: all 0.3s ease;
	box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
}

.form-control:hover,
.form-control:focus {
	background-color: #5b6b94;
	outline: none;
	box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.form-control option {
	background-color: #2a3b63;
	color: white;
	padding: 10px;
}

.btn-pdf {
	background-color: #ff9800;
	color: white;
	padding: 15px;
	margin: 10px 0;
	border: none;
	border-radius: 5px;
	cursor: pointer;
	font-size: 16px;
	width: 100%;
	max-width: 400px;
	text-align: center;
	transition: background-color 0.3s;
}

.btn-pdf:hover {
	background-color: #f57c00;
}

.modal {
	display: flex;
	position: fixed;
	z-index: 1;
	left: 0;
	top: 0;
	width: 100%;
	height: 100%;
	overflow: auto;
	background-color: rgba(0, 0, 0, 0.4);
	justify-content: center;
	align-items: center;
}

.modal-content {
	background-color: #fefefe;
	padding: 20px;
	border: 1px solid #888;
	width: 90%;
	max-width: 800px;
	position: relative;
}

.pdf-content {
	height: 80vh;
	display: flex;
	flex-direction: column;
}

.close {
	color: #aaa;
	float: right;
	font-size: 28px;
	font-weight: bold;
	cursor: pointer;
	position: absolute;
	right: 10px;
	top: 5px;
}

.close:hover,
.close:focus {
	color: black;
	text-decoration: none;
	cursor: pointer;
}

.pdf-content iframe {
	flex-grow: 1;
	border: none;
	margin-top: 20px;
}

/* Responsive adjustments */
@media screen and (max-width: 768px) {
	.question-container {
		margin-bottom: 20px;
	}

	.btn-return {
		margin-top: 20px;
	}

	.logo {
		margin-top: 30px;
	}
}

@media screen and (max-width: 480px) {
	.form-control {
		max-width: 100%;
	}

	.checkbox-option label {
		font-size: 14px;
		padding: 12px 12px 12px 45px;
	}

	.checkbox-option label:before {
		width: 20px;
		height: 20px;
		left: 12px;
	}

	.checkbox-option input[type="checkbox"]:checked+label:after {
		left: 18px;
		font-size: 14px;
	}
}
</style>