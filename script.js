const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resumeBtn = document.getElementById('resumeBtn');

let utterance;

// --- Admin Upload Book ---
document.getElementById('uploadForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  const formData = new FormData();
  formData.append("title", document.getElementById('bookTitle').value);
  formData.append("author", document.getElementById('bookAuthor').value);
  formData.append("file", document.getElementById('bookFile').files[0]);

  const response = await fetch('http://localhost:3000/upload', {
    method: 'POST',
    body: formData
  });

  const result = await response.json();
  alert(result.message);
});

// --- Text-to-Speech Helper ---
function speak(text) {
  utterance = new SpeechSynthesisUtterance(text);
  speechSynthesis.speak(utterance);
}

// --- Voice Recognition Setup ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.lang = 'en-US';

// --- Read Available Books + Start Voice Listening ---
startBtn.onclick = async () => {
  const res = await fetch('http://localhost:3000/books');
  const books = await res.json();

  if (!books.length) {
    speak("No books uploaded yet.");
    return;
  }

  let bookList = "Available books are: ";
  books.forEach((book, i) => {
    bookList += `Book ${i + 1}: ${book.title} by ${book.author}. `;
  });

  speak(bookList + " Please say the book title.");
  startListening();
};

stopBtn.onclick = () => speechSynthesis.pause();
resumeBtn.onclick = () => speechSynthesis.resume();

// --- Listen for Book Title ---
let selectedBook = null;
let currentParagraphIndex = 0;
let pdfTextArray = [];

function startListening() {
  recognition.start();
  recognition.onresult = (event) => {
    const userSpeech = event.results[0][0].transcript.toLowerCase();
    console.log("User said:", userSpeech);
    matchBookByVoice(userSpeech);
  };
}

function matchBookByVoice(saidTitle) {
  fetch('http://localhost:3000/books')
    .then(res => res.json())
    .then(books => {
      const match = books.find(book =>
        book.title.toLowerCase().includes(saidTitle)
      );
      if (match) {
        selectedBook = match;
        speak(`You selected ${match.title}. Shall I start reading? Say yes or no.`);
        waitForYesToStartReading();
      } else {
        speak("Book not found. Please say the book title again.");
        startListening();
      }
    });
}

function waitForYesToStartReading() {
  recognition.start();
  recognition.onresult = (event) => {
    const response = event.results[0][0].transcript.toLowerCase();
    if (response.includes("yes")) {
      fetchPDFAndRead(selectedBook.file);
    } else {
      speak("Okay, cancelled.");
    }
  };
}

// --- Load PDF and Split into Paragraphs ---
function fetchPDFAndRead(filename) {
  const url = `http://localhost:3000/pdf/${filename}`;
  pdfjsLib.getDocument(url).promise.then(pdf => {
    let textPromises = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      textPromises.push(pdf.getPage(i).then(page => page.getTextContent()));
    }

    Promise.all(textPromises).then(pages => {
      let allText = pages.map(content => content.items.map(i => i.str).join(' ')).join('\n\n');
      pdfTextArray = allText.split(/\n{2,}/); // split by paragraphs
      currentParagraphIndex = 0;
      readParagraphWithExplanation();
    });
  });
}

// --- Read and Explain using Gemini ---
function readParagraphWithExplanation() {
  if (currentParagraphIndex >= pdfTextArray.length) {
    speak("End of book.");
    return;
  }

  const para = pdfTextArray[currentParagraphIndex];
  fetch('http://localhost:3000/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paragraph: para })
  })
  .then(res => res.json())
  .then(data => {
    speak(`Paragraph: ${para}. Explanation: ${data.explanation}`);
    listenForNextCommand();
  });
}

function listenForNextCommand() {
  recognition.start();
  recognition.onresult = (event) => {
    const command = event.results[0][0].transcript.toLowerCase();
    if (command.includes("next")) {
      currentParagraphIndex++;
      readParagraphWithExplanation();
    } else if (command.includes("stop")) {
      speechSynthesis.pause();
    } else if (command.includes("resume")) {
      speechSynthesis.resume();
    } else {
      speak("Say next, stop or resume.");
      listenForNextCommand();
    }
  };
}
