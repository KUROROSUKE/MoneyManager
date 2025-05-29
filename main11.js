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

let isUserListenerSet = false;

function loadUsers() {
    const select = document.getElementById("receiverSelect");
    const StockSelect = document.getElementById("UsersStock");
    const userBalanceList = document.getElementById("userBalanceList");

    if (isUserListenerSet) return;  // リスナーが既に設定済みなら何もしない
    isUserListenerSet = true;

    db.ref("users").on("value", (snapshot) => {
        const users = snapshot.val();
        console.log(users)
        userBalanceList.innerHTML = '';
        select.innerHTML = '<option value="">-- ユーザーを選択 --</option>';
        StockSelect.innerHTML = '<option value="">-- ユーザーを選択 --</option>';

        if (users && currentUser) {
            // 🔁 リセットはここで！

            Object.entries(users).forEach(([uid, data]) => {
                if (uid !== currentUser.uid) {
                    const option = document.createElement("option");
                    option.value = uid;
                    option.textContent = `${data.name}（残高：${data.balance ?? 0}円）`;
                    select.appendChild(option);

                    const option2 = document.createElement("option");
                    option2.value = uid;
                    option2.textContent = `${data.name}（残高：${data.stock ?? 0}株）`;
                    StockSelect.appendChild(option2);
                }

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

document.getElementById("BuyStock").addEventListener("click", function() {
    // まずは連投できないようにボタンを無効化する
    const button = document.getElementById("BuyStock");
    button.disabled = "disabled";

    const StockAmount = document.getElementById("StockAmount");
    const toUid = document.getElementById("UsersStock").value;
    const fromUid = currentUser.uid;
    const message = document.getElementById("StockMessage");

    console.log(`fromRef : ${fromRef}`);
    console.log(`toRef   : ${toRef  }`);

    // 最初に、本人かどうか・有効かどうかだけ確認
    if (!currentUser) {alert("ログインしてください！");return;}
    if (!toUid || isNaN(StockAmount) || StockAmount <= 0) {alert("有効な送金先と金額を入力してください");return;}

    // 確認してからRef（各ユーザのデータへのパス・構造）を取得して通信削減
    const fromRef = db.ref("users/" + fromUid);
    const toRef = db.ref("users/" + toUid);

    // 相手の株価を取得
    const stockPrice = toRef.once("value").then(snapshot => {
        const toData = snapshot.val();
        return toData.stock;
    });

    // fromRefから1一回だけfromデータを取得
    fromRef.once("value").then(snapshot => {
        const fromData = snapshot.val();

        // fromユーザのデータがある ・ 所持金がnumber型か ・ 所持金が足りているか 確認
        if (!fromData || typeof fromData.balance !== "number") {message.textContent = "❌ 自分のデータが見つかりません";return;}
        if (fromData.balance < StockAmount * stockPrice) {message.textContent = "❌ 残高不足です";return;}

        // トランザクションを使って一貫性を保って処理
        fromRef.transaction(current => {
            // currentはfromユーザのデータの内容
            // currentがない、もしくは、データのbalance（所持金額）がnumber型でないなら終了
            if (!current || typeof current.balance !== "number") return current;

            // balanceから、 その人の株価x株数 を引く（買う）
            current.balance -= StockAmount * stockPrice;
            return current;
        }).then(result => {
            // currentデータを正常に返されたときの処理（所持金額から請求分だけ引いたデータ）
            // resultは正常な形式で処理済みのデータ

            // DBのデータが正常に変更されたか
            if (!result.committed) {message.textContent = "❌ トランザクション中止（自分）";return;}

            // トランザクションを使って一貫性を保って処理
            toRef.transaction(current => {
                // currentはfromユーザのデータの内容
                // currentがない、もしくは、データのbalance（所持金額）がnumber型でないなら終了
                if (!current || typeof current.balance !== "number") return current;

                // balanceに、 その人の株価x株数 を足す（買われる）
                current.balance += StockAmount * stockPrice;
                return current;
            }).then(toResult => {
                // toResultは処理済みのデータ
                // DBのデータが正常に変更されたか
                if (!toResult.committed) {
                    message.textContent = "⚠️ 相手のトランザクション中止（リトライ推奨）";
                    return;
                }

                // 正常に終了していたらメッセージを表示
                message.textContent = "✅ 送金成功！";

                // 資金一覧や選択肢（の所持金）を更新する
                loadUsers();
            });
        });
    })
    // 失敗でも成功でもボタンを有効化
    button.disabled = "null";
})

document.getElementById("SellStock").addEventListener("click", function() {
    // まずは連投できないようにボタンを無効化する
    const button = document.getElementById("SellStock");
    button.disabled = "disabled";

    const StockAmount = document.getElementById("StockAmount");
    const toUid = document.getElementById("UsersStock").value;
    const fromUid = currentUser.uid;
    const message = document.getElementById("StockMessage");

    console.log(`fromRef : ${fromRef}`);
    console.log(`toRef   : ${toRef  }`);

    // 最初に、本人かどうか・有効かどうかだけ確認
    if (!currentUser) {alert("ログインしてください！");return;}
    if (!toUid || isNaN(StockAmount) || StockAmount <= 0) {alert("有効な送金先と金額を入力してください");return;}

    // 確認してからRef（各ユーザのデータへのパス・構造）を取得して通信削減
    const fromRef = db.ref("users/" + fromUid);
    const toRef = db.ref("users/" + toUid);

    // 相手の株価を取得
    const stockPrice = toRef.once("value").then(snapshot => {
        const toData = snapshot.val();
        return toData.stock;
    });

    // fromRefから1一回だけfromデータを取得
    fromRef.once("value").then(snapshot => {
        const fromData = snapshot.val();

        // fromユーザのデータがある ・ 所持金がnumber型か ・ 所持金が足りているか 確認
        if (!fromData || typeof fromData.balance !== "number") {message.textContent = "❌ 自分のデータが見つかりません";return;}
        if (fromData.balance < StockAmount * stockPrice) {message.textContent = "❌ 残高不足です";return;}

        // トランザクションを使って一貫性を保って処理
        fromRef.transaction(current => {
            // currentはfromユーザのデータの内容
            // currentがない、もしくは、データのbalance（所持金額）がnumber型でないなら終了
            if (!current || typeof current.balance !== "number") return current;

            // balanceから、 その人の株価x株数 を足す（売る）
            current.balance += StockAmount * stockPrice;
            return current;
        }).then(result => {
            // currentデータを正常に返されたときの処理（所持金額から請求分だけ引いたデータ）
            // resultは正常な形式で処理済みのデータ

            // DBのデータが正常に変更されたか
            if (!result.committed) {message.textContent = "❌ トランザクション中止（自分）";return;}

            // トランザクションを使って一貫性を保って処理
            toRef.transaction(current => {
                // currentはfromユーザのデータの内容
                // currentがない、もしくは、データのbalance（所持金額）がnumber型でないなら終了
                if (!current || typeof current.balance !== "number") return current;

                // balanceに、 その人の株価x株数 を引く（売られる）
                current.balance -= StockAmount * stockPrice;
                return current;
            }).then(toResult => {
                // toResultは処理済みのデータ
                // DBのデータが正常に変更されたか
                if (!toResult.committed) {
                    message.textContent = "⚠️ 相手のトランザクション中止（リトライ推奨）";
                    return;
                }

                // 正常に終了していたらメッセージを表示
                message.textContent = "✅ 送金成功！";

                // 資金一覧や選択肢（の所持金）を更新する
                loadUsers();
            });
        });
    })
    // 失敗でも成功でもボタンを有効化
    button.disabled = "null";
})