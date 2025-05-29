const firebaseConfig = {
    apiKey: "AIzaSyC_8ZxABdbxPH8lQGBPuCuZZIk_hLKi6OI",
    authDomain: "moneymanager-a0e97.firebaseapp.com",
    databaseURL: "https://moneymanager-a0e97-default-rtdb.firebaseio.com",
    projectId: "moneymanager-a0e97",
    storageBucket: "moneymanager-a0e97.appspot.com",
    messagingSenderId: "649411038344",
    appId: "1:649411038344:web:bacd8a5c7a743e6edf633d"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

let currentUser = null;

const nameInput = document.getElementById("nameInput");
const nameEditSection = document.getElementById("nameEditSection");
const nameMessage = document.getElementById("nameMessage");
const userBalanceList = document.getElementById("userBalanceList");

function getRandomName() {
    const animals = ["neko", "inu", "tori", "kuma", "saru", "kitsune", "tanuki", "shika", "tako", "penguin"];
    const rand = animals[Math.floor(Math.random() * animals.length)] + Math.floor(Math.random() * 1000);
    return rand;
}

async function getAllNames() {
    const snapshot = await db.ref("users").once("value");
    const users = snapshot.val();
    return users ? Object.values(users).map(u => u.name) : [];
}

async function generateUniqueName() {
    const existingNames = await getAllNames();
    let name;
    do {
    name = getRandomName();
    } while (existingNames.includes(name));
    return name;
}

function login() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
    alert("ログイン失敗：" + error.message);
    });
}

function logout() {
    auth.signOut();
}

auth.onAuthStateChanged(async user => {
    const userInfo = document.getElementById("userInfo");
    if (user) {
    currentUser = user;
    userInfo.innerHTML = `✅ ログイン中：${user.displayName}（UID: ${user.uid}）`;

    const userRef = db.ref("users/" + user.uid);
    const snapshot = await userRef.once("value");
    const val = snapshot.val();

    if (!val || val.balance == null) {
        const uniqueName = await generateUniqueName();
        await userRef.set({
        name: uniqueName,
        balance: 1000,
        stock: 0
        });
        nameInput.value = uniqueName;
    } else {
        nameInput.value = val.name || "";
    }

    loadUsers();
    nameEditSection.style.display = "block";
    } else {
    currentUser = null;
    userInfo.textContent = "ログインしていません。";
    document.getElementById("receiverSelect").innerHTML = '<option value="">-- ユーザーを選択 --</option>';
    nameEditSection.style.display = "none";
    }
});

async function updateName() {
    const newName = nameInput.value.trim();
    if (!newName) {
    nameMessage.textContent = "❌ 空の名前は使えません";
    return;
    }

    const existingNames = await getAllNames();
    if (existingNames.includes(newName)) {
    nameMessage.textContent = "❌ この名前は既に使われています";
    return;
    }

    const userRef = db.ref("users/" + currentUser.uid);
    userRef.update({ name: newName })
    .then(() => {
        nameMessage.textContent = "✅ 名前を更新しました";
        loadUsers();
    })
    .catch(error => {
        nameMessage.textContent = "❌ エラー：" + error.message;
    });
}

function loadUsers() {
    const select = document.getElementById("receiverSelect");
    const StockSelect = document.getElementById("UsersStock");
    const userBalanceList = document.getElementById("userBalanceList");

    db.ref("users").on("value", (snapshot) => {
        const users = snapshot.val();

        if (users && currentUser) {
            // 🔁 ここでリセット（ループ外！）
            userBalanceList.innerHTML = '';
            select.innerHTML = '<option value="">-- ユーザーを選択 --</option>';
            StockSelect.innerHTML = '<option value="">-- ユーザーを選択 --</option>';

            Object.entries(users).forEach(([uid, data]) => {
                // 送金先・株式セレクトボックス
                if (uid !== currentUser.uid) {
                    const option = document.createElement("option");
                    option.value = uid;
                    option.textContent = `${data.name}（残高：${data.balance}円）`;
                    select.appendChild(option);

                    const option2 = document.createElement("option");
                    option2.value = uid;
                    option2.textContent = `${data.name}（残高：${data.stock ?? 0}円）`;
                    StockSelect.appendChild(option2);
                }

                // 資金一覧表示
                const li = document.createElement("li");
                li.textContent = `${data.name}：${data.balance ?? 0}円`;
                userBalanceList.appendChild(li);
            });
        }
    }, (error) => {
        console.error("ユーザーデータの読み込みエラー:", error);
    });
}

function handleTransfer(event) {
    event.preventDefault();

    const toUid = document.getElementById("receiverSelect").value;
    const amount = parseInt(document.getElementById("amount").value, 10);
    const message = document.getElementById("message");
    message.textContent = "";

    if (!currentUser) {
    alert("ログインしてください！");
    return;
    }

    if (!toUid || isNaN(amount) || amount <= 0) {
    alert("有効な送金先と金額を入力してください");
    return;
    }

    const fromUid = currentUser.uid;
    const fromRef = db.ref("users/" + fromUid);
    const toRef = db.ref("users/" + toUid);

    fromRef.once("value").then((snapshot) => {
        const fromData = snapshot.val();

        if (!fromData || typeof fromData.balance !== "number") {
            message.textContent = "❌ 自分のデータが見つかりません";
            return;
        }

        if (fromData.balance < amount) {
            message.textContent = "❌ 残高不足です";
            return;
        }

        fromRef.transaction(current => {
            if (!current || typeof current.balance !== "number") return current;
            current.balance -= amount;
            return current;
        }).then(result => {
            if (!result.committed) {
            message.textContent = "❌ トランザクション中止（自分）";
            return;
            }

            toRef.transaction(current => {
            if (!current || typeof current.balance !== "number") return current;
            current.balance += amount;
            return current;
            }).then(toResult => {
            if (!toResult.committed) {
                message.textContent = "⚠️ 相手のトランザクション中止（リトライ推奨）";
                return;
            }

            message.textContent = "✅ 送金成功！";
            loadUsers();
            });
        });
        }).catch(error => {
        message.textContent = "❌ 処理中エラー：" + error.message;
    });
}

document.getElementById("BuyStock").addEventListener("click", async function () {
    const button = document.getElementById("BuyStock");
    button.disabled = true;

    const StockAmount = parseInt(document.getElementById("StockAmount").value, 10);
    const toUid = document.getElementById("UsersStock").value;
    const fromUid = currentUser?.uid;
    const message = document.getElementById("StockMessage");

    if (!currentUser) { alert("ログインしてください！"); button.disabled = false; return; }
    if (!toUid || isNaN(StockAmount) || StockAmount <= 0) { alert("有効な送金先と株数を入力してください"); button.disabled = false; return; }

    const fromRef = db.ref("users/" + fromUid);
    const toRef   = db.ref("users/" + toUid);

    try {
        const stockSnapshot = await toRef.once("value");
        const stockPrice = stockSnapshot.val()?.stock;

        if (typeof stockPrice !== "number" || isNaN(stockPrice)) {
            message.textContent = "❌ 株価が無効です";
            button.disabled = false;
            return;
        }

        const fromSnapshot = await fromRef.once("value");
        const fromData = fromSnapshot.val();

        if (!fromData || typeof fromData.balance !== "number") {
            message.textContent = "❌ 自分のデータが見つかりません";
            button.disabled = false;
            return;
        }

        const totalPrice = StockAmount * stockPrice;
        if (fromData.balance < totalPrice) {
            message.textContent = "❌ 残高不足です";
            button.disabled = false;
            return;
        }

        await fromRef.transaction(current => {
            if (!current || typeof current.balance !== "number") return current;
            current.balance -= totalPrice;
            current[toUid] = (current[toUid] || 0) + StockAmount;
            return current;
        });

        await toRef.transaction(current => {
            if (!current || typeof current.balance !== "number") return current;
            current.balance += totalPrice;
            current.price += StockAmount;
            return current;
        });

        message.textContent = "✅ 株購入成功！";
        loadUsers();
    } catch (error) {
        message.textContent = "❌ エラー：" + error.message;
    }

    button.disabled = false;
});

document.getElementById("SellStock").addEventListener("click", async function () {
    const button = document.getElementById("SellStock");
    button.disabled = true;

    const StockAmount = parseInt(document.getElementById("StockAmount").value, 10);
    const toUid = document.getElementById("UsersStock").value;
    const fromUid = currentUser?.uid;
    const message = document.getElementById("StockMessage");

    if (!currentUser) { alert("ログインしてください！"); button.disabled = false; return; }
    if (!toUid || isNaN(StockAmount) || StockAmount <= 0) { alert("有効な送金先と株数を入力してください"); button.disabled = false; return; }

    const fromRef = db.ref("users/" + fromUid);
    const toRef = db.ref("users/" + toUid);

    try {
        const stockSnapshot = await toRef.once("value");
        const stockPrice = stockSnapshot.val()?.stock;

        if (typeof stockPrice !== "number" || isNaN(stockPrice)) {
            message.textContent = "❌ 株価が無効です";
            button.disabled = false;
            return;
        }

        const fromSnapshot = await fromRef.once("value");
        const fromData = fromSnapshot.val();

        const ownedStocks = fromData?.[toUid] || 0;
        if (ownedStocks < StockAmount) {
            message.textContent = "❌ 株数不足です";
            button.disabled = false;
            return;
        }

        await fromRef.transaction(current => {
            if (!current || typeof current.balance !== "number") return current;
            current.balance += StockAmount * stockPrice;
            current[toUid] -= StockAmount;
            return current;
        });

        await toRef.transaction(current => {
            if (!current || typeof current.balance !== "number") return current;
            current.balance -= StockAmount * stockPrice;
            current.price -= StockAmount;
            return current;
        });

        message.textContent = "✅ 株売却成功！";
        loadUsers();
    } catch (error) {
        message.textContent = "❌ エラー：" + error.message;
    }

    button.disabled = false;
});

document.getElementById("UsersStock").addEventListener("change", async function() {
    const toUid = document.getElementById("UsersStock").value;
    const fromUid = currentUser?.uid;
    const display = document.getElementById("UsersStockAmount");

    if (!currentUser) {
        alert("ログインしてください！");
        display.textContent = "";
        return;
    }

    if (!toUid) {
        display.textContent = "";
        return;
    }

    const fromRef = db.ref("users/" + fromUid);

    try {
        const snapshot = await fromRef.once("value");
        const fromData = snapshot.val();
        const stockCount = fromData?.[toUid] || 0;

        display.textContent = `${stockCount} 枚`;
    } catch (error) {
        console.error("株数の取得エラー:", error);
        display.textContent = "❌ エラー";
    }
});
