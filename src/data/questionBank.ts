export type QuestionType = 'mcq' | 'multiselect' | 'truefalse';

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options: string[]; // for tf: ['True', 'False']
}

// Dummy question bank. In a real app, this would be fetched from Firestore.
export const dummyQuestionBank: Question[] = [
  {
    id: "q1",
    type: "mcq",
    text: "What is the time complexity of binary search?",
    options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"]
  },
  {
    id: "q2",
    type: "mcq",
    text: "Which data structure uses LIFO (Last In First Out) principle?",
    options: ["Queue", "Stack", "Tree", "Graph"]
  },
  {
    id: "q3",
    type: "multiselect",
    text: "Which of the following are sorting algorithms?",
    options: ["Bubble Sort", "Dijkstra's Algorithm", "Merge Sort", "BFS"]
  },
  {
    id: "q4",
    type: "truefalse",
    text: "JavaScript is a statically typed language.",
    options: ["True", "False"]
  },
  {
    id: "q5",
    type: "mcq",
    text: "In React, what hook is used to manage side effects?",
    options: ["useState", "useEffect", "useMemo", "useContext"]
  },
  {
    id: "q6",
    type: "multiselect",
    text: "Which of these are valid HTTP methods?",
    options: ["GET", "FETCH", "POST", "UPDATE"]
  },
  {
    id: "q7",
    type: "mcq",
    text: "What does CSS stand for?",
    options: ["Computer Style Sheets", "Creative Style Sheets", "Cascading Style Sheets", "Colorful Style Sheets"]
  },
  {
    id: "q8",
    type: "truefalse",
    text: "SQL stands for Structured Query Language.",
    options: ["True", "False"]
  }
];

// Utility to randomly select N questions from the bank
export const getRandomQuestions = (num: number): Question[] => {
  const shuffled = [...dummyQuestionBank].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, num);
};
