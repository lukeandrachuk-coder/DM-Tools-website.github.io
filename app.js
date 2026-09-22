/* =========================================================
   DM TOOLKIT
   LOCAL D&D CAMPAIGN MANAGER
   ========================================================= */

const DB_NAME = "DMToolkit";
const DB_VERSION = 2;

let db = null;

let currentPage = "home";
let currentCampaignId = null;
let currentUserId = null;

let sidebarOpen =
    localStorage.getItem("dm_sidebar_open") !== "false";


/* =========================================================
   DATABASE
   ========================================================= */

function openDB() {

    return new Promise((resolve, reject) => {

        const request =
            indexedDB.open(
                DB_NAME,
                DB_VERSION
            );


        request.onupgradeneeded = event => {

            const database =
                event.target.result;


            if (!database.objectStoreNames.contains("campaigns")) {

                database.createObjectStore(
                    "campaigns",
                    { keyPath: "id" }
                );

            }


            if (!database.objectStoreNames.contains("entries")) {

                database.createObjectStore(
                    "entries",
                    { keyPath: "id" }
                );

            }


            if (!database.objectStoreNames.contains("characters")) {

                database.createObjectStore(
                    "characters",
                    { keyPath: "id" }
                );

            }


            if (!database.objectStoreNames.contains("combats")) {

                database.createObjectStore(
                    "combats",
                    { keyPath: "id" }
                );

            }


            if (!database.objectStoreNames.contains("maps")) {

                database.createObjectStore(
                    "maps",
                    { keyPath: "id" }
                );

            }


            if (!database.objectStoreNames.contains("sessions")) {

                database.createObjectStore(
                    "sessions",
                    { keyPath: "id" }
                );

            }


            /*
               NEW IN VERSION 2:
               Local accounts.
            */

            if (!database.objectStoreNames.contains("accounts")) {

                database.createObjectStore(
                    "accounts",
                    { keyPath: "id" }
                );

            }

        };


        request.onsuccess = event => {

            db = event.target.result;

            resolve(db);

        };


        request.onerror = () => {

            reject(request.error);

        };

    });

}


function all(storeName) {

    return new Promise((resolve,reject) => {

        const transaction =
            db.transaction(
                storeName,
                "readonly"
            );

        const store =
            transaction.objectStore(
                storeName
            );

        const request =
            store.getAll();

        request.onsuccess =
            () => resolve(request.result);

        request.onerror =
            () => reject(request.error);

    });

}


function one(storeName,id) {

    return new Promise((resolve,reject) => {

        const transaction =
            db.transaction(
                storeName,
                "readonly"
            );

        const store =
            transaction.objectStore(
                storeName
            );

        const request =
            store.get(id);

        request.onsuccess =
            () => resolve(request.result);

        request.onerror =
            () => reject(request.error);

    });

}


function put(storeName,object) {

    return new Promise((resolve,reject) => {

        const transaction =
            db.transaction(
                storeName,
                "readwrite"
            );

        const store =
            transaction.objectStore(
                storeName
            );

        const request =
            store.put(object);

        request.onsuccess =
            () => resolve(object);

        request.onerror =
            () => reject(request.error);

    });

}


function del(storeName,id) {

    return new Promise((resolve,reject) => {

        const transaction =
            db.transaction(
                storeName,
                "readwrite"
            );

        const store =
            transaction.objectStore(
                storeName
            );

        const request =
            store.delete(id);

        request.onsuccess =
            () => resolve();

        request.onerror =
            () => reject(request.error);

    });

}


function makeId(prefix="id") {

    return prefix +
        "_" +
        Date.now() +
        "_" +
        Math.random()
            .toString(36)
            .slice(2,9);

}


function esc(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value)
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");

}


/* =========================================================
   AUTHENTICATION
   ========================================================= */

function showLogin() {

    document.getElementById(
        "loginPanel"
    ).hidden = false;

    document.getElementById(
        "createAccountPanel"
    ).hidden = true;

}


function showCreateAccount() {

    document.getElementById(
        "loginPanel"
    ).hidden = true;

    document.getElementById(
        "createAccountPanel"
    ).hidden = false;

}


async function createAccount(event) {

    event.preventDefault();


    const username =
        document.getElementById(
            "createUsername"
        ).value.trim();


    const password =
        document.getElementById(
            "createPassword"
        ).value;


    const confirmation =
        document.getElementById(
            "createPasswordConfirm"
        ).value;


    if (password !== confirmation) {

        alert(
            "The passwords do not match."
        );

        return;

    }


    const accounts =
        await all("accounts");


    const duplicate =
        accounts.find(
            account =>
                account.username
                    .toLowerCase() ===
                username.toLowerCase()
        );


    if (duplicate) {

        alert(
            "That username already exists."
        );

        return;

    }


    const account = {

        id:
            makeId("account"),

        username,

        /*
           This is a local browser application,
           not a server-backed authentication system.
           The password is stored locally.
        */

        password,

        createdAt:
            new Date().toISOString()

    };


    await put(
        "accounts",
        account
    );


    /*
       Give older unowned campaign data to
       the first account created.

       This allows your existing v0.2 data
       to survive the upgrade.
    */

    if (accounts.length === 0) {

        await claimLegacyData(
            account.id
        );

    }


    currentUserId =
        account.id;


    localStorage.setItem(
        "dm_current_user",
        account.id
    );


    enterApplication();


    showToast(
        "Account created."
    );

}


async function login(event) {

    event.preventDefault();


    const username =
        document.getElementById(
            "loginUsername"
        ).value.trim();


    const password =
        document.getElementById(
            "loginPassword"
        ).value;


    const accounts =
        await all("accounts");


    const account =
        accounts.find(
            a =>
                a.username.toLowerCase() ===
                username.toLowerCase() &&
                a.password === password
        );


    if (!account) {

        alert(
            "Username or password is incorrect."
        );

        return;

    }


    currentUserId =
        account.id;


    localStorage.setItem(
        "dm_current_user",
        account.id
    );


    enterApplication();


    showToast(
        "Welcome back, " +
        account.username +
        "."
    );

}


async function claimLegacyData(accountId) {

    const stores = [
        "campaigns",
        "entries",
        "characters",
        "combats",
        "maps",
        "sessions"
    ];


    for (const storeName of stores) {

        const records =
            await all(storeName);


        for (const record of records) {

            /*
               Only old records without an owner
               are claimed.
            */

            if (!record.ownerId) {

                record.ownerId =
                    accountId;

                await put(
                    storeName,
                    record
                );

            }

        }

    }

}


async function restoreLogin() {

    const savedUser =
        localStorage.getItem(
            "dm_current_user"
        );


    if (!savedUser) {

        showAuthScreen();

        return;

    }


    const account =
        await one(
            "accounts",
            savedUser
        );


    if (!account) {

        localStorage.removeItem(
            "dm_current_user"
        );

        showAuthScreen();

        return;

    }


    currentUserId =
        account.id;


    enterApplication();

}


function showAuthScreen() {

    const auth =
        document.getElementById("authScreen");

    const app =
        document.getElementById("appScreen");


    auth.hidden = false;
    auth.style.display = "flex";


    app.hidden = true;
    app.style.display = "none";

}


async function enterApplication() {

    const auth =
        document.getElementById("authScreen");

    const app =
        document.getElementById("appScreen");


    /*
       Completely remove the login screen
       from the visible layout.
    */

    auth.hidden = true;
    auth.style.display = "none";


    /*
       Immediately show the application.
    */

    app.hidden = false;
    app.style.display = "block";


    const account =
        await one(
            "accounts",
            currentUserId
        );


    document.getElementById(
        "loggedInUser"
    ).textContent =
        account
            ? "👤 " + account.username
            : "";


    applySidebarState();


    const campaigns =
        await getMyCampaigns();


    /*
       Do not automatically open a campaign.
       The new home screen is the campaign launcher.
    */

    currentCampaignId =
        null;


    await updateCampaignTitle();

    render();

}


function logout() {

    currentCampaignId =
        null;

    currentUserId =
        null;


    localStorage.removeItem(
        "dm_current_user"
    );


    const auth =
        document.getElementById("authScreen");

    const app =
        document.getElementById("appScreen");


    app.hidden = true;
    app.style.display = "none";


    auth.hidden = false;
    auth.style.display = "flex";


    showLogin();

}

/* =========================================================
   ACCOUNT DATA FILTERING
   ========================================================= */

async function getMyCampaigns() {

    if (!currentUserId) {
        return [];
    }


    const campaigns =
        await all("campaigns");


    return campaigns.filter(
        campaign =>
            campaign.ownerId ===
            currentUserId
    );

}


async function getMyRecords(storeName) {

    if (!currentUserId) {
        return [];
    }


    const records =
        await all(storeName);


    return records.filter(
        record =>
            record.ownerId ===
            currentUserId &&
            (
                !currentCampaignId ||
                record.campaignId ===
                currentCampaignId
            )
    );

}


/* =========================================================
   SIDEBAR
   ========================================================= */

function toggleSidebar() {

    sidebarOpen =
        !sidebarOpen;


    localStorage.setItem(
        "dm_sidebar_open",
        sidebarOpen
    );


    applySidebarState();

}


function applySidebarState() {

    const sidebar =
        document.getElementById(
            "sidebar"
        );


    if (!sidebar) {
        return;
    }


    sidebar.classList.toggle(
        "collapsed",
        !sidebarOpen
    );

}


/* =========================================================
   GENERAL UI
   ========================================================= */

function showToast(message) {

    const container =
        document.getElementById(
            "toast-container"
        );


    const toast =
        document.createElement(
            "div"
        );


    toast.className =
        "toast";


    toast.textContent =
        message;


    container.appendChild(
        toast
    );


    setTimeout(
        () => toast.remove(),
        2600
    );

}


function openModal(title,html) {

    const modal =
        document.getElementById(
            "modal"
        );


    document.getElementById(
        "modalTitle"
    ).textContent =
        title;


    document.getElementById(
        "modalBody"
    ).innerHTML =
        html;


    modal.showModal();

}


function closeModal() {

    document.getElementById(
        "modal"
    ).close();

}


function modalFormButtons() {

    return `

        <div class="form-actions">

            <button
                type="button"
                class="secondary-button"
                onclick="closeModal()">

                Cancel

            </button>

            <button
                type="submit"
                class="primary-button">

                Save

            </button>

        </div>

    `;

}


/* =========================================================
   CAMPAIGN TITLE
   ========================================================= */

async function updateCampaignTitle() {

    const title =
        document.getElementById(
            "campaignTitle"
        );


    if (!title) {
        return;
    }


    if (!currentCampaignId) {

        title.textContent =
            "No campaign selected";

        return;

    }


    const campaign =
        await one(
            "campaigns",
            currentCampaignId
        );


    title.textContent =
        campaign?.name ||
        "No campaign selected";

}


/* =========================================================
   CAMPAIGN LAUNCHER / HOME
   ========================================================= */

async function renderHome() {

    const page =
        document.getElementById("page");


    /*
       No campaign selected:
       show the campaign launcher.
    */

    if (!currentCampaignId) {

        const campaigns =
            await getMyCampaigns();


        page.innerHTML = `

            <div class="campaign-launcher">

                <div class="launcher-emblem dm-logo">

                    <svg viewBox="0 0 100 100">
                        <path class="logo-shield"
                              d="M50 5
                                 L88 18
                                 L84 57
                                 C80 76 67 88 50 96
                                 C33 88 20 76 16 57
                                 L12 18 Z"/>

                        <path class="logo-inner"
                              d="M50 16
                                 L76 25
                                 L73 55
                                 C70 68 62 76 50 84
                                 C38 76 30 68 27 55
                                 L24 25 Z"/>

                        <path class="logo-letter"
                              d="M34 31
                                 H53
                                 C63 31 68 37 68 47
                                 C68 57 63 63 53 63
                                 H34 Z
                                 M45 40
                                 V54
                                 H52
                                 C56 54 58 52 58 47
                                 C58 42 56 40 52 40 Z"/>
                    </svg>

                </div>


                <h1>
                    Welcome to the Realm
                </h1>


                <p class="page-subtitle">
                    Choose a campaign to continue your adventure.
                </p>


                <div class="launcher-card">

                    <h2>
                        Open Campaign
                    </h2>

                    <p>
                        Enter a campaign code to open a campaign.
                    </p>


                    <form
                        onsubmit="openCampaignByCode(event)">

                        <div class="campaign-code-row">

                            <input
                                id="campaignCodeInput"
                                placeholder="Campaign code"
                                autocomplete="off"
                                required>

                            <button
                                class="primary-button"
                                type="submit">

                                Open Campaign

                            </button>

                        </div>

                    </form>


                    <div class="launcher-divider">

                        <span>or</span>

                    </div>


                    <button
                        class="gold-button launcher-new-button"
                        onclick="showCampaignForm()">

                        New Campaign

                    </button>

                </div>


                ${
                    campaigns.length
                        ? `

                            <div class="launcher-existing">

                                <h2>
                                    Your Campaigns
                                </h2>

                                ${campaigns
                                    .map(
                                        campaign =>
                                            `

                                            <button
                                                class="campaign-list-item"
                                                onclick="
                                                    openSpecificCampaign(
                                                        '${campaign.id}'
                                                    )
                                                ">

                                                <span>
                                                    ${esc(
                                                        campaign.name
                                                    )}
                                                </span>

                                                <small>
                                                    ${esc(
                                                        campaign.code ||
                                                        "No code"
                                                    )}
                                                </small>

                                            </button>

                                            `
                                    )
                                    .join("")}

                            </div>

                        `
                        : ""
                }

            </div>

        `;

        return;

    }


    /*
       A campaign is selected.
       Show the campaign dashboard and
       the Add buttons.
    */

    const campaign =
        await one(
            "campaigns",
            currentCampaignId
        );


    if (!campaign) {

        currentCampaignId =
            null;

        await renderHome();

        return;

    }


    const entries =
        await getMyRecords("entries");

    const characters =
        await getMyRecords("characters");

    const combats =
        await getMyRecords("combats");

    const maps =
        await getMyRecords("maps");

    const sessions =
        await getMyRecords("sessions");


    page.innerHTML = `

        <div class="toolbar">

            <div>

                <h1 class="page-title">
                    ${esc(campaign.name)}
                </h1>

                <p class="page-subtitle">
                    ${esc(
                        campaign.description ||
                        "Your campaign world."
                    )}
                </p>

            </div>


            <button
                class="secondary-button"
                onclick="showCampaignForm('${campaign.id}')">

                Edit Campaign

            </button>

        </div>


        <div class="stat-grid">

            <div class="stat-card">

                <span class="stat-number">
                    ${characters.length}
                </span>

                <span class="stat-label">
                    Characters
                </span>

            </div>


            <div class="stat-card">

                <span class="stat-number">
                    ${entries.length}
                </span>

                <span class="stat-label">
                    Wiki Entries
                </span>

            </div>


            <div class="stat-card">

                <span class="stat-number">
                    ${combats.length}
                </span>

                <span class="stat-label">
                    Encounters
                </span>

            </div>


            <div class="stat-card">

                <span class="stat-number">
                    ${maps.length}
                </span>

                <span class="stat-label">
                    Maps
                </span>

            </div>


            <div class="stat-card">

                <span class="stat-number">
                    ${sessions.length}
                </span>

                <span class="stat-label">
                    Sessions
                </span>

            </div>

        </div>


        <!-- =================================================
             CAMPAIGN ADD BUTTONS
             ================================================= -->

        <div class="card">

            <div class="card-header">

                <div>

                    <h2>
                        Campaign Tools
                    </h2>

                    <p>
                        Add something to your campaign.
                    </p>

                </div>

            </div>


            <div class="campaign-add-grid">

                <button
                    class="campaign-add-button"
                    onclick="showCharacterForm()">

                    <span>+</span>
                    Add Character

                </button>


                <button
                    class="campaign-add-button"
                    onclick="showStatblockForm()">

                    <span>+</span>
                    Add Statblock

                </button>


                <button
                    class="campaign-add-button"
                    onclick="showCampaignEntryForm('NPC')">

                    <span>+</span>
                    Add NPC

                </button>


                <button
                    class="campaign-add-button"
                    onclick="showCampaignEntryForm('Monster')">

                    <span>+</span>
                    Add Monster

                </button>


                <button
                    class="campaign-add-button"
                    onclick="showCampaignEntryForm('Item')">

                    <span>+</span>
                    Add Item

                </button>


                <button
                    class="campaign-add-button"
                    onclick="showCampaignEntryForm('Weapon')">

                    <span>+</span>
                    Add Weapon

                </button>


                <button
                    class="campaign-add-button"
                    onclick="showCampaignEntryForm('Armor')">

                    <span>+</span>
                    Add Armor

                </button>


                <button
                    class="campaign-add-button"
                    onclick="showCampaignEntryForm('Location')">

                    <span>+</span>
                    Add Location

                </button>


                <button
                    class="campaign-add-button"
                    onclick="showCampaignEntryForm('Faction')">

                    <span>+</span>
                    Add Faction

                </button>


                <button
                    class="campaign-add-button"
                    onclick="showCampaignEntryForm('Quest')">

                    <span>+</span>
                    Add Quest

                </button>


                <button
                    class="campaign-add-button"
                    onclick="showCampaignEntryForm('Lore')">

                    <span>+</span>
                    Add Lore

                </button>


                <button
                    class="campaign-add-button"
                    onclick="showSessionForm()">

                    <span>+</span>
                    Add Session

                </button>

            </div>

        </div>


        <div class="card">

            <div class="card-header">

                <div>

                    <h2>
                        Campaign Code
                    </h2>

                    <p>
                        Give this code to someone who needs
                        to open the campaign.
                    </p>

                </div>

            </div>


            <div class="campaign-code-display">

                ${esc(
                    campaign.code ||
                    "No campaign code"
                )}

            </div>

        </div>


        <div class="card">

            <h2>
                Quick Start
            </h2>

            <p>
                Use the buttons above to build your campaign,
                or open the sidebar for the full toolkit.
            </p>

        </div>

    `;

}

async function openCampaignByCode(event) {

    event.preventDefault();


    const code =
        document.getElementById(
            "campaignCodeInput"
        ).value.trim();


    const campaigns =
        await all("campaigns");


    const campaign =
        campaigns.find(
            c =>
                c.code &&
                c.code.toLowerCase() ===
                code.toLowerCase()
        );


    if (!campaign) {

        showToast(
            "No campaign was found with that code."
        );

        return;

    }


    /*
       A campaign code is the local equivalent
       of a join/open code in this offline version.

       We associate the campaign with this account
       so it becomes available to that user.
    */

    campaign.ownerId =
        currentUserId;


    await put(
        "campaigns",
        campaign
    );


    currentCampaignId =
        campaign.id;


    await updateCampaignTitle();


    showToast(
        "Campaign opened."
    );


    render();

}


async function openSpecificCampaign(campaignId) {

    const campaign =
        await one(
            "campaigns",
            campaignId
        );


    if (!campaign) {
        return;
    }


    if (
        campaign.ownerId !==
        currentUserId
    ) {

        showToast(
            "You do not have access to this campaign."
        );

        return;

    }


    currentCampaignId =
        campaignId;


    await updateCampaignTitle();


    render();

}


/* =========================================================
   CAMPAIGN FORM
   ========================================================= */

async function showCampaignForm(campaignId=null) {

    const campaign =
        campaignId
            ? await one(
                "campaigns",
                campaignId
            )
            : null;


    if (
        campaign &&
        campaign.ownerId !==
        currentUserId
    ) {
        return;
    }


    openModal(

        campaign
            ? "Edit Campaign"
            : "New Campaign",

        `

        <form
            onsubmit="
                saveCampaign(
                    event,
                    '${campaignId || ""}'
                )
            ">

            <div class="form-grid">

                <div class="form-field full">

                    <label>
                        Campaign Name
                    </label>

                    <input
                        id="campaignName"
                        required
                        value="${esc(
                            campaign?.name || ""
                        )}"
                        placeholder="The Lost Kingdom">

                </div>


                <div class="form-field">

                    <label>
                        Campaign Code
                    </label>

                    <input
                        id="campaignCode"
                        value="${esc(
                            campaign?.code ||
                            generateCampaignCode()
                        )}"
                        placeholder="ABCD-1234">

                </div>


                <div class="form-field">

                    <label>
                        Dungeon Master
                    </label>

                    <input
                        id="campaignDM"
                        value="${esc(
                            campaign?.dm || ""
                        )}"
                        placeholder="Dungeon Master">

                </div>


                <div class="form-field full">

                    <label>
                        Description
                    </label>

                    <textarea
                        id="campaignDescription"
                        placeholder="Describe the setting, tone, and adventure...">${esc(
                            campaign?.description || ""
                        )}</textarea>

                </div>

            </div>


            ${modalFormButtons()}

        </form>

        `
    );

}


function generateCampaignCode() {

    const letters =
        "ABCDEFGHJKLMNPQRSTUVWXYZ";


    let result = "";


    for (let i=0;i<4;i++) {

        result +=
            letters[
                Math.floor(
                    Math.random() *
                    letters.length
                )
            ];

    }


    result += "-";


    for (let i=0;i<4;i++) {

        result +=
            Math.floor(
                Math.random()*10
            );

    }


    return result;

}


async function saveCampaign(
    event,
    campaignId
) {

    event.preventDefault();


    const existing =
        campaignId
            ? await one(
                "campaigns",
                campaignId
            )
            : null;


    const campaign = {

        id:
            campaignId ||
            makeId("campaign"),

        ownerId:
            currentUserId,

        name:
            document.getElementById(
                "campaignName"
            ).value.trim(),

        code:
            document.getElementById(
                "campaignCode"
            ).value.trim(),

        dm:
            document.getElementById(
                "campaignDM"
            ).value.trim(),

        description:
            document.getElementById(
                "campaignDescription"
            ).value.trim(),

        createdAt:
            existing?.createdAt ||
            new Date().toISOString(),

        updatedAt:
            new Date().toISOString()

    };


    await put(
        "campaigns",
        campaign
    );


    currentCampaignId =
        campaign.id;


    await updateCampaignTitle();


    closeModal();


    showToast(
        campaignId
            ? "Campaign updated."
            : "Campaign created."
    );


    render();

}


/* =========================================================
   PAGE RENDERING
   ========================================================= */

async function render() {

    await updateCampaignTitle();


    document.querySelectorAll(
        ".nav-button"
    ).forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.page ===
            currentPage
        );

    });


    /*
       All campaign pages except Home
       require a selected campaign.
    */

    if (
        currentPage !== "home" &&
        !currentCampaignId
    ) {

        currentPage = "home";

    }


    switch(currentPage) {

        case "home":
            await renderHome();
            break;

        case "wiki":
            await renderWiki();
            break;

        case "characters":
            await renderCharacters();
            break;

        case "combat":
            await renderCombat();
            break;

        case "maps":
            await renderMaps();
            break;

        case "sessions":
            await renderSessions();
            break;

        case "dice":
            renderDice();
            break;

        case "generators":
            renderGenerators();
            break;

        case "settings":
            await renderSettings();
            break;

        default:
            await renderHome();

    }

}


document.querySelectorAll(
    ".nav-button"
).forEach(button => {

    button.addEventListener(
        "click",
        () => {

            currentPage =
                button.dataset.page;

            render();

        }
    );

});


/* =========================================================
   DASHBOARD
   ========================================================= */

async function renderDashboardData() {

    const [
        entries,
        characters,
        combats,
        maps,
        sessions
    ] = await Promise.all([

        getMyRecords("entries"),
        getMyRecords("characters"),
        getMyRecords("combats"),
        getMyRecords("maps"),
        getMyRecords("sessions")

    ]);


    return {
        entries,
        characters,
        combats,
        maps,
        sessions
    };

}


/* =========================================================
   WIKI
   ========================================================= */

async function renderWiki() {

    const page =
        document.getElementById(
            "page"
        );


    const entries =
        await getMyRecords(
            "entries"
        );


    page.innerHTML = `

        <div class="toolbar">

            <div>

                <h1 class="page-title">
                    Campaign Wiki
                </h1>

                <p class="page-subtitle">
                    Search and manage your world.
                </p>

            </div>


            <button
                class="primary-button"
                onclick="showEntryForm()">

                + Add Wiki Entry

            </button>

        </div>


        <div class="card">

            <div class="form-field search-box">

                <label>
                    Search Wiki
                </label>

                <input
                    id="wikiSearch"
                    placeholder="Search..."
                    oninput="filterWiki()">

            </div>

        </div>


        <div id="wikiResults">

            ${
                entries.length
                    ? entries
                        .map(renderWikiEntry)
                        .join("")
                    : `
                        <div class="empty-state">

                            <strong>
                                No Wiki Entries
                            </strong>

                            Add your first location,
                            NPC, monster, faction,
                            item, quest, or lore entry.

                        </div>
                    `
            }

        </div>

    `;

}


function renderWikiEntry(entry) {

    const stat =
        entry.statblock;


    const ability =
        stat?.abilities || {};


    const isStatblock =
        entry.type === "Statblock" &&
        stat;


    return `

        <div
            class="card wiki-entry"
            data-search="
                ${esc(
                    (
                        entry.name +
                        " " +
                        entry.type +
                        " " +
                        entry.description +
                        " " +
                        (
                            stat
                                ? JSON.stringify(stat)
                                : ""
                        )
                    ).toLowerCase()
                )}
            ">

            ${
                entry.image
                    ? `
                        <img
                            class="entry-image"
                            src="${esc(entry.image)}">
                    `
                    : `
                        <div class="entry-image placeholder">
                            📖
                        </div>
                    `
            }


            <div style="flex:1">

                <div class="card-header">

                    <div>

                        <span class="tag">
                            ${esc(
                                stat?.type ||
                                entry.type ||
                                "Lore"
                            )}
                        </span>

                        <h2>
                            ${esc(entry.name)}
                        </h2>

                    </div>


                    <div>

                        <button
                            class="small-button"
                            onclick="
                                ${
                                    isStatblock
                                        ? `showStatblockForm('${entry.id}')`
                                        : `showEntryForm('${entry.id}')`
                                }
                            ">

                            Edit

                        </button>


                        <button
                            class="small-button"
                            onclick="
                                deleteEntry(
                                    '${entry.id}'
                                )
                            ">

                            Delete

                        </button>

                    </div>

                </div>


                ${
                    isStatblock
                        ? `

                            <div class="statblock-wiki">

                                ${
                                    stat.size ||
                                    stat.alignment
                                        ? `
                                            <p class="statblock-subtitle">
                                                ${esc(stat.size || "")}
                                                ${
                                                    stat.size &&
                                                    stat.alignment
                                                        ? " • "
                                                        : ""
                                                }
                                                ${esc(stat.alignment || "")}
                                            </p>
                                        `
                                        : ""
                                }


                                <div class="statblock-core">

                                    ${
                                        stat.armorClass
                                            ? `
                                                <div>
                                                    <strong>Armor Class:</strong>
                                                    ${esc(stat.armorClass)}
                                                </div>
                                            `
                                            : ""
                                    }

                                    ${
                                        stat.hitPoints
                                            ? `
                                                <div>
                                                    <strong>Hit Points:</strong>
                                                    ${esc(stat.hitPoints)}
                                                    ${
                                                        stat.hitDice
                                                            ? " (" +
                                                              esc(stat.hitDice) +
                                                              ")"
                                                            : ""
                                                    }
                                                </div>
                                            `
                                            : ""
                                    }

                                    ${
                                        stat.speed
                                            ? `
                                                <div>
                                                    <strong>Speed:</strong>
                                                    ${esc(stat.speed)}
                                                </div>
                                            `
                                            : ""
                                    }

                                </div>


                                <div class="statblock-abilities">

                                    <div>
                                        <strong>STR</strong>
                                        <span>${esc(ability.strength ?? 10)}</span>
                                    </div>

                                    <div>
                                        <strong>DEX</strong>
                                        <span>${esc(ability.dexterity ?? 10)}</span>
                                    </div>

                                    <div>
                                        <strong>CON</strong>
                                        <span>${esc(ability.constitution ?? 10)}</span>
                                    </div>

                                    <div>
                                        <strong>INT</strong>
                                        <span>${esc(ability.intelligence ?? 10)}</span>
                                    </div>

                                    <div>
                                        <strong>WIS</strong>
                                        <span>${esc(ability.wisdom ?? 10)}</span>
                                    </div>

                                    <div>
                                        <strong>CHA</strong>
                                        <span>${esc(ability.charisma ?? 10)}</span>
                                    </div>

                                </div>


                                ${
                                    stat.savingThrows
                                        ? `
                                            <div class="statblock-section">
                                                <strong>Saving Throws:</strong>
                                                ${esc(stat.savingThrows)}
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.skills
                                        ? `
                                            <div class="statblock-section">
                                                <strong>Skills:</strong>
                                                ${esc(stat.skills)}
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.vulnerabilities
                                        ? `
                                            <div class="statblock-section">
                                                <strong>Damage Vulnerabilities:</strong>
                                                ${esc(stat.vulnerabilities)}
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.resistances
                                        ? `
                                            <div class="statblock-section">
                                                <strong>Damage Resistances:</strong>
                                                ${esc(stat.resistances)}
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.immunities
                                        ? `
                                            <div class="statblock-section">
                                                <strong>Damage Immunities:</strong>
                                                ${esc(stat.immunities)}
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.conditionImmunities
                                        ? `
                                            <div class="statblock-section">
                                                <strong>Condition Immunities:</strong>
                                                ${esc(stat.conditionImmunities)}
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.senses
                                        ? `
                                            <div class="statblock-section">
                                                <strong>Senses:</strong>
                                                ${esc(stat.senses)}
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.languages
                                        ? `
                                            <div class="statblock-section">
                                                <strong>Languages:</strong>
                                                ${esc(stat.languages)}
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.challenge
                                        ? `
                                            <div class="statblock-section">
                                                <strong>Challenge / Level:</strong>
                                                ${esc(stat.challenge)}
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.specialAbilities
                                        ? `
                                            <div class="statblock-section">
                                                <h3>Special Abilities</h3>
                                                <p>${esc(stat.specialAbilities)}</p>
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.attacks
                                        ? `
                                            <div class="statblock-section">
                                                <h3>Attacks</h3>
                                                <p>${esc(stat.attacks)}</p>
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.actions
                                        ? `
                                            <div class="statblock-section">
                                                <h3>Actions</h3>
                                                <p>${esc(stat.actions)}</p>
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.bonusActions
                                        ? `
                                            <div class="statblock-section">
                                                <h3>Bonus Actions</h3>
                                                <p>${esc(stat.bonusActions)}</p>
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.reactions
                                        ? `
                                            <div class="statblock-section">
                                                <h3>Reactions</h3>
                                                <p>${esc(stat.reactions)}</p>
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.legendaryActions
                                        ? `
                                            <div class="statblock-section">
                                                <h3>Legendary Actions</h3>
                                                <p>${esc(stat.legendaryActions)}</p>
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.weaknesses
                                        ? `
                                            <div class="statblock-section">
                                                <h3>Weaknesses</h3>
                                                <p>${esc(stat.weaknesses)}</p>
                                            </div>
                                        `
                                        : ""
                                }


                                ${
                                    stat.description
                                        ? `
                                            <div class="statblock-section">
                                                <h3>Description</h3>
                                                <p>${esc(stat.description)}</p>
                                            </div>
                                        `
                                        : ""
                                }

                            </div>

                        `
                        : `
                            <p>
                                ${esc(
                                    entry.description ||
                                    "No description."
                                )}
                            </p>
                        `
                }

            </div>

        </div>

    `;

}


function filterWiki() {

    const query =
        document.getElementById(
            "wikiSearch"
        ).value.toLowerCase();


    document.querySelectorAll(
        "[data-search]"
    ).forEach(element => {

        element.style.display =
            element.dataset.search
                .includes(query)
                ? ""
                : "none";

    });

}


async function showEntryForm(entryId=null) {

    const entry =
        entryId
            ? await one(
                "entries",
                entryId
            )
            : null;


    const types = [

        "Location",
        "NPC",
        "Monster",
        "Faction",
        "Item",
        "Quest",
        "Lore"

    ];


    openModal(

        entry
            ? "Edit Wiki Entry"
            : "Add Wiki Entry",

        `

        <form
            onsubmit="
                saveEntry(
                    event,
                    '${entryId || ""}'
                )
            ">

            <div class="form-grid">

                <div class="form-field">

                    <label>
                        Name
                    </label>

                    <input
                        id="entryName"
                        required
                        value="${esc(
                            entry?.name || ""
                        )}">

                </div>


                <div class="form-field">

                    <label>
                        Type
                    </label>

                    <select id="entryType">

                        ${types
                            .map(
                                type =>
                                    `
                                    <option
                                        ${
                                            entry?.type ===
                                            type
                                            ? "selected"
                                            : ""
                                        }>
                                        ${type}
                                    </option>
                                    `
                            )
                            .join("")}

                    </select>

                </div>


                <div class="form-field full">

                    <label>
                        Description
                    </label>

                    <textarea
                        id="entryDescription">${esc(
                            entry?.description ||
                            ""
                        )}</textarea>

                </div>


                <div class="form-field full">

                    <label>
                        DM Notes
                    </label>

                    <textarea
                        id="entryNotes">${esc(
                            entry?.notes ||
                            ""
                        )}</textarea>

                </div>


                <div class="form-field full">

                    <label>
                        Image URL
                    </label>

                    <input
                        id="entryImage"
                        value="${esc(
                            entry?.image ||
                            ""
                        )}">

                </div>


                <div class="checkbox-row">

                    <input
                        id="entryPlayerVisible"
                        type="checkbox"
                        ${
                            entry?.playerVisible
                                ? "checked"
                                : ""
                        }>

                    <label>
                        Visible to players
                    </label>

                </div>

            </div>


            ${modalFormButtons()}

        </form>

        `
    );

}

/* =========================================================
   CAMPAIGN ENTITY QUICK ADD
   ========================================================= */

async function showCampaignEntryForm(type) {

    const types = [
        "NPC",
        "Monster",
        "Item",
        "Weapon",
        "Armor",
        "Location",
        "Faction",
        "Quest",
        "Lore"
    ];


    openModal(

        "Add " + type,

        `

        <form
            onsubmit="
                saveCampaignEntry(
                    event,
                    '${esc(type)}'
                )
            ">

            <div class="form-grid">

                <div class="form-field">

                    <label>
                        Name
                    </label>

                    <input
                        id="campaignEntryName"
                        required
                        placeholder="${esc(type)} name">

                </div>


                <div class="form-field">

                    <label>
                        Type
                    </label>

                    <select
                        id="campaignEntryType">

                        ${
                            types
                                .map(
                                    option =>
                                        `
                                        <option
                                            value="${esc(option)}"
                                            ${
                                                option === type
                                                    ? "selected"
                                                    : ""
                                            }>

                                            ${esc(option)}

                                        </option>
                                        `
                                )
                                .join("")
                        }

                    </select>

                </div>


                <div class="form-field full">

                    <label>
                        Description
                    </label>

                    <textarea
                        id="campaignEntryDescription"
                        placeholder="Describe this entry..."></textarea>

                </div>


                <div class="form-field full">

                    <label>
                        DM Notes
                    </label>

                    <textarea
                        id="campaignEntryNotes"
                        placeholder="Private notes for the Dungeon Master..."></textarea>

                </div>


                <div class="form-field">

                    <label>
                        Image URL
                    </label>

                    <input
                        id="campaignEntryImage"
                        placeholder="Optional image URL">

                </div>


                <div class="form-field">

                    <label>
                        Tags
                    </label>

                    <input
                        id="campaignEntryTags"
                        placeholder="magic, ancient, important">

                </div>


                <div class="checkbox-row">

                    <input
                        id="campaignEntryVisible"
                        type="checkbox"
                        checked>

                    <label>
                        Visible to players
                    </label>

                </div>

            </div>


            ${modalFormButtons()}

        </form>

        `
    );

}


async function saveCampaignEntry(
    event,
    forcedType
) {

    event.preventDefault();


    const entry = {

        id:
            makeId("entry"),

        ownerId:
            currentUserId,

        campaignId:
            currentCampaignId,

        name:
            document.getElementById(
                "campaignEntryName"
            ).value.trim(),

        type:
            document.getElementById(
                "campaignEntryType"
            ).value || forcedType,

        description:
            document.getElementById(
                "campaignEntryDescription"
            ).value.trim(),

        notes:
            document.getElementById(
                "campaignEntryNotes"
            ).value.trim(),

        image:
            document.getElementById(
                "campaignEntryImage"
            ).value.trim(),

        tags:
            document.getElementById(
                "campaignEntryTags"
            ).value.trim(),

        playerVisible:
            document.getElementById(
                "campaignEntryVisible"
            ).checked,

        createdAt:
            new Date().toISOString(),

        updatedAt:
            new Date().toISOString()

    };


    await put(
        "entries",
        entry
    );


    closeModal();

    showToast(
        entry.type +
        " added to the campaign."
    );


    render();

}

/* =========================================================
   STATBLOCK CREATOR
   ========================================================= */

function showStatblockForm() {

    openModal(

        "Add Statblock",

        `

        <form
            onsubmit="saveStatblock(event)">

            <div class="form-grid">

                <div class="form-field">

                    <label>
                        Statblock Type
                    </label>

                    <select id="statblockType">

                        <option>
                            Monster
                        </option>

                        <option>
                            NPC
                        </option>

                        <option>
                            Creature
                        </option>

                        <option>
                            Boss
                        </option>

                        <option>
                            Beast
                        </option>

                        <option>
                            Humanoid
                        </option>

                        <option>
                            Custom
                        </option>

                    </select>

                </div>


                <div class="form-field">

                    <label>
                        Name
                    </label>

                    <input
                        id="statblockName"
                        required
                        placeholder="Creature name">

                </div>


                <div class="form-field">

                    <label>
                        Size
                    </label>

                    <select id="statblockSize">

                        <option>
                            Tiny
                        </option>

                        <option>
                            Small
                        </option>

                        <option selected>
                            Medium
                        </option>

                        <option>
                            Large
                        </option>

                        <option>
                            Huge
                        </option>

                        <option>
                            Gargantuan
                        </option>

                    </select>

                </div>


                <div class="form-field">

                    <label>
                        Alignment
                    </label>

                    <input
                        id="statblockAlignment"
                        placeholder="Any alignment">

                </div>


                <div class="form-field">

                    <label>
                        Armor Class
                    </label>

                    <input
                        id="statblockAC"
                        type="number"
                        min="0"
                        placeholder="15">

                </div>


                <div class="form-field">

                    <label>
                        Hit Points
                    </label>

                    <input
                        id="statblockHP"
                        type="number"
                        min="0"
                        placeholder="45">

                </div>


                <div class="form-field">

                    <label>
                        Hit Dice
                    </label>

                    <input
                        id="statblockHitDice"
                        placeholder="6d8 + 18">

                </div>


                <div class="form-field">

                    <label>
                        Speed
                    </label>

                    <input
                        id="statblockSpeed"
                        placeholder="30 ft., fly 40 ft.">

                </div>

            </div>


            <hr class="form-divider">


            <h3>
                Ability Scores
            </h3>


            <div class="form-grid three">

                <div class="form-field">

                    <label>
                        Strength
                    </label>

                    <input
                        id="statblockSTR"
                        type="number"
                        value="10">

                </div>


                <div class="form-field">

                    <label>
                        Dexterity
                    </label>

                    <input
                        id="statblockDEX"
                        type="number"
                        value="10">

                </div>


                <div class="form-field">

                    <label>
                        Constitution
                    </label>

                    <input
                        id="statblockCON"
                        type="number"
                        value="10">

                </div>


                <div class="form-field">

                    <label>
                        Intelligence
                    </label>

                    <input
                        id="statblockINT"
                        type="number"
                        value="10">

                </div>


                <div class="form-field">

                    <label>
                        Wisdom
                    </label>

                    <input
                        id="statblockWIS"
                        type="number"
                        value="10">

                </div>


                <div class="form-field">

                    <label>
                        Charisma
                    </label>

                    <input
                        id="statblockCHA"
                        type="number"
                        value="10">

                </div>

            </div>


            <hr class="form-divider">


            <div class="form-grid">

                <div class="form-field full">

                    <label>
                        Saving Throws
                    </label>

                    <input
                        id="statblockSaves"
                        placeholder="Dex +5, Wis +4">

                </div>


                <div class="form-field full">

                    <label>
                        Skills
                    </label>

                    <input
                        id="statblockSkills"
                        placeholder="Perception +5, Stealth +6">

                </div>


                <div class="form-field">

                    <label>
                        Damage Vulnerabilities
                    </label>

                    <textarea
                        id="statblockVulnerabilities"
                        placeholder="Fire, radiant..."></textarea>

                </div>


                <div class="form-field">

                    <label>
                        Damage Resistances
                    </label>

                    <textarea
                        id="statblockResistances"
                        placeholder="Cold, lightning..."></textarea>

                </div>


                <div class="form-field">

                    <label>
                        Damage Immunities
                    </label>

                    <textarea
                        id="statblockImmunities"
                        placeholder="Poison..."></textarea>

                </div>


                <div class="form-field">

                    <label>
                        Condition Immunities
                    </label>

                    <textarea
                        id="statblockConditionImmunities"
                        placeholder="Charmed, frightened..."></textarea>

                </div>


                <div class="form-field full">

                    <label>
                        Senses
                    </label>

                    <input
                        id="statblockSenses"
                        placeholder="Darkvision 60 ft., passive Perception 15">

                </div>


                <div class="form-field">

                    <label>
                        Languages
                    </label>

                    <input
                        id="statblockLanguages"
                        placeholder="Common, Draconic">

                </div>


                <div class="form-field">

                    <label>
                        Challenge / Level
                    </label>

                    <input
                        id="statblockChallenge"
                        placeholder="CR 5">

                </div>

            </div>


            <hr class="form-divider">


            <h3>
                Abilities & Actions
            </h3>


            <div class="form-grid">

                <div class="form-field full">

                    <label>
                        Special Abilities
                    </label>

                    <textarea
                        id="statblockAbilities"
                        placeholder="Name — description..."></textarea>

                </div>


                <div class="form-field full">

                    <label>
                        Attacks
                    </label>

                    <textarea
                        id="statblockAttacks"
                        placeholder="Claw — +6 to hit, 1d8 + 4 slashing..."></textarea>

                </div>


                <div class="form-field full">

                    <label>
                        Actions
                    </label>

                    <textarea
                        id="statblockActions"
                        placeholder="Describe actions..."></textarea>

                </div>


                <div class="form-field full">

                    <label>
                        Bonus Actions
                    </label>

                    <textarea
                        id="statblockBonusActions"
                        placeholder="Describe bonus actions..."></textarea>

                </div>


                <div class="form-field full">

                    <label>
                        Reactions
                    </label>

                    <textarea
                        id="statblockReactions"
                        placeholder="Describe reactions..."></textarea>

                </div>


                <div class="form-field full">

                    <label>
                        Legendary Actions
                    </label>

                    <textarea
                        id="statblockLegendaryActions"
                        placeholder="Describe legendary actions..."></textarea>

                </div>


                <div class="form-field full">

                    <label>
                        Weaknesses
                    </label>

                    <textarea
                        id="statblockWeaknesses"
                        placeholder="Specific weaknesses or special vulnerabilities..."></textarea>

                </div>


                <div class="form-field full">

                    <label>
                        Description
                    </label>

                    <textarea
                        id="statblockDescription"
                        placeholder="Describe the creature..."></textarea>

                </div>


                <div class="form-field full">

                    <label>
                        Image URL
                    </label>

                    <input
                        id="statblockImage"
                        placeholder="Optional image URL">

                </div>


                <div class="checkbox-row">

                    <input
                        id="statblockPlayerVisible"
                        type="checkbox">

                    <label>
                        Visible to players
                    </label>

                </div>

            </div>


            ${modalFormButtons()}

        </form>

        `
    );

}

async function saveStatblock(event) {

    event.preventDefault();


    const statblock = {

        type:
            document.getElementById(
                "statblockType"
            ).value,

        size:
            document.getElementById(
                "statblockSize"
            ).value,

        alignment:
            document.getElementById(
                "statblockAlignment"
            ).value.trim(),

        armorClass:
            Number(
                document.getElementById(
                    "statblockAC"
                ).value
            ) || 0,

        hitPoints:
            Number(
                document.getElementById(
                    "statblockHP"
                ).value
            ) || 0,

        hitDice:
            document.getElementById(
                "statblockHitDice"
            ).value.trim(),

        speed:
            document.getElementById(
                "statblockSpeed"
            ).value.trim(),

        abilities: {

            strength:
                Number(
                    document.getElementById(
                        "statblockSTR"
                    ).value
                ) || 10,

            dexterity:
                Number(
                    document.getElementById(
                        "statblockDEX"
                    ).value
                ) || 10,

            constitution:
                Number(
                    document.getElementById(
                        "statblockCON"
                    ).value
                ) || 10,

            intelligence:
                Number(
                    document.getElementById(
                        "statblockINT"
                    ).value
                ) || 10,

            wisdom:
                Number(
                    document.getElementById(
                        "statblockWIS"
                    ).value
                ) || 10,

            charisma:
                Number(
                    document.getElementById(
                        "statblockCHA"
                    ).value
                ) || 10

        },

        savingThrows:
            document.getElementById(
                "statblockSaves"
            ).value.trim(),

        skills:
            document.getElementById(
                "statblockSkills"
            ).value.trim(),

        vulnerabilities:
            document.getElementById(
                "statblockVulnerabilities"
            ).value.trim(),

        resistances:
            document.getElementById(
                "statblockResistances"
            ).value.trim(),

        immunities:
            document.getElementById(
                "statblockImmunities"
            ).value.trim(),

        conditionImmunities:
            document.getElementById(
                "statblockConditionImmunities"
            ).value.trim(),

        senses:
            document.getElementById(
                "statblockSenses"
            ).value.trim(),

        languages:
            document.getElementById(
                "statblockLanguages"
            ).value.trim(),

        challenge:
            document.getElementById(
                "statblockChallenge"
            ).value.trim(),

        specialAbilities:
            document.getElementById(
                "statblockAbilities"
            ).value.trim(),

        attacks:
            document.getElementById(
                "statblockAttacks"
            ).value.trim(),

        actions:
            document.getElementById(
                "statblockActions"
            ).value.trim(),

        bonusActions:
            document.getElementById(
                "statblockBonusActions"
            ).value.trim(),

        reactions:
            document.getElementById(
                "statblockReactions"
            ).value.trim(),

        legendaryActions:
            document.getElementById(
                "statblockLegendaryActions"
            ).value.trim(),

        weaknesses:
            document.getElementById(
                "statblockWeaknesses"
            ).value.trim(),

        description:
            document.getElementById(
                "statblockDescription"
            ).value.trim(),

        image:
            document.getElementById(
                "statblockImage"
            ).value.trim()

    };


    const entry = {

        id:
            makeId("statblock"),

        ownerId:
            currentUserId,

        campaignId:
            currentCampaignId,

        name:
            document.getElementById(
                "statblockName"
            ).value.trim(),

        type:
            "Statblock",

        description:
            statblock.description,

        notes:
            "",

        image:
            statblock.image,

        playerVisible:
            document.getElementById(
                "statblockPlayerVisible"
            ).checked,

        statblock,

        createdAt:
            new Date().toISOString(),

        updatedAt:
            new Date().toISOString()

    };


    await put(
        "entries",
        entry
    );


    closeModal();


    showToast(
        "Statblock added to the campaign."
    );


    render();

}

async function saveEntry(
    event,
    entryId
) {

    event.preventDefault();


    const existing =
        entryId
            ? await one(
                "entries",
                entryId
            )
            : null;


    const entry = {

        id:
            entryId ||
            makeId("entry"),

        ownerId:
            currentUserId,

        campaignId:
            currentCampaignId,

        name:
            document.getElementById(
                "entryName"
            ).value.trim(),

        type:
            document.getElementById(
                "entryType"
            ).value,

        description:
            document.getElementById(
                "entryDescription"
            ).value.trim(),

        notes:
            document.getElementById(
                "entryNotes"
            ).value.trim(),

        image:
            document.getElementById(
                "entryImage"
            ).value.trim(),

        playerVisible:
            document.getElementById(
                "entryPlayerVisible"
            ).checked,

        createdAt:
            existing?.createdAt ||
            new Date().toISOString(),

        updatedAt:
            new Date().toISOString()

    };


    await put(
        "entries",
        entry
    );


    closeModal();

    showToast(
        entryId
            ? "Wiki entry updated."
            : "Wiki entry created."
    );


    render();

}


async function deleteEntry(id) {

    if (
        !confirm(
            "Delete this wiki entry?"
        )
    ) {
        return;
    }


    await del(
        "entries",
        id
    );


    showToast(
        "Wiki entry deleted."
    );


    render();

}


/* =========================================================
   CHARACTERS
   ========================================================= */

async function renderCharacters() {

    const page =
        document.getElementById(
            "page"
        );


    const characters =
        await getMyRecords(
            "characters"
        );


    page.innerHTML = `

        <div class="toolbar">

            <div>

                <h1 class="page-title">
                    Characters
                </h1>

                <p class="page-subtitle">
                    Player characters and campaign information.
                </p>

            </div>


            <button
                class="primary-button"
                onclick="showCharacterForm()">

                + Add Character

            </button>

        </div>


        ${
            characters.length
                ? `
                    <div class="character-grid">

                        ${characters
                            .map(
                                character =>
                                    `
                                    <div class="character-card">

                                        ${
                                            character.image
                                                ? `
                                                    <img
                                                        class="character-card-image"
                                                        src="${esc(
                                                            character.image
                                                        )}">
                                                `
                                                : `
                                                    <div
                                                        class="character-card-image"
                                                        style="
                                                            display:flex;
                                                            align-items:center;
                                                            justify-content:center;
                                                            font-size:55px;
                                                        ">
                                                        ♙
                                                    </div>
                                                `
                                        }


                                        <div class="character-card-body">

                                            <h3>
                                                ${esc(
                                                    character.name
                                                )}
                                            </h3>

                                            <p>
                                                <strong>
                                                    Player:
                                                </strong>
                                                ${esc(
                                                    character.player ||
                                                    "Unassigned"
                                                )}
                                            </p>

                                            <p>
                                                ${esc(
                                                    character.race ||
                                                    ""
                                                )}
                                                ${
                                                    character.className
                                                        ? " • " +
                                                          esc(
                                                              character.className
                                                          )
                                                        : ""
                                                }
                                            </p>


                                            <button
                                                class="small-button"
                                                onclick="
                                                    showCharacterForm(
                                                        '${character.id}'
                                                    )
                                                ">

                                                Edit

                                            </button>


                                            <button
                                                class="small-button"
                                                onclick="
                                                    deleteCharacter(
                                                        '${character.id}'
                                                    )
                                                ">

                                                Delete

                                            </button>

                                        </div>

                                    </div>
                                    `
                            )
                            .join("")}

                    </div>
                `
                : `
                    <div class="empty-state">

                        <strong>
                            No Characters
                        </strong>

                        Add a player character.

                    </div>
                `
        }

    `;

}


async function showCharacterForm(
    characterId=null
) {

    const character =
        characterId
            ? await one(
                "characters",
                characterId
            )
            : null;


    openModal(

        character
            ? "Edit Character"
            : "Add Character",

        `

        <form
            onsubmit="
                saveCharacter(
                    event,
                    '${characterId || ""}'
                )
            ">

            <div class="form-grid">

                <div class="form-field">

                    <label>
                        Character Name
                    </label>

                    <input
                        id="characterName"
                        required
                        value="${esc(
                            character?.name ||
                            ""
                        )}">

                </div>


                <div class="form-field">

                    <label>
                        Player
                    </label>

                    <input
                        id="characterPlayer"
                        value="${esc(
                            character?.player ||
                            ""
                        )}">

                </div>


                <div class="form-field">

                    <label>
                        Race / Species
                    </label>

                    <input
                        id="characterRace"
                        value="${esc(
                            character?.race ||
                            ""
                        )}">

                </div>


                <div class="form-field">

                    <label>
                        Class
                    </label>

                    <input
                        id="characterClass"
                        value="${esc(
                            character?.className ||
                            ""
                        )}">

                </div>


                <div class="form-field">

                    <label>
                        Level
                    </label>

                    <input
                        id="characterLevel"
                        type="number"
                        min="1"
                        value="${esc(
                            character?.level ||
                            1
                        )}">

                </div>


                <div class="form-field">

                    <label>
                        Image URL
                    </label>

                    <input
                        id="characterImage"
                        value="${esc(
                            character?.image ||
                            ""
                        )}">

                </div>


                <div class="form-field full">

                    <label>
                        Description
                    </label>

                    <textarea
                        id="characterDescription">${esc(
                            character?.description ||
                            ""
                        )}</textarea>

                </div>


                <div class="form-field full">

                    <label>
                        DM Notes
                    </label>

                    <textarea
                        id="characterNotes">${esc(
                            character?.notes ||
                            ""
                        )}</textarea>

                </div>

            </div>


            ${modalFormButtons()}

        </form>

        `
    );

}


async function saveCharacter(
    event,
    characterId
) {

    event.preventDefault();


    const existing =
        characterId
            ? await one(
                "characters",
                characterId
            )
            : null;


    const character = {

        id:
            characterId ||
            makeId("character"),

        ownerId:
            currentUserId,

        campaignId:
            currentCampaignId,

        name:
            document.getElementById(
                "characterName"
            ).value.trim(),

        player:
            document.getElementById(
                "characterPlayer"
            ).value.trim(),

        race:
            document.getElementById(
                "characterRace"
            ).value.trim(),

        className:
            document.getElementById(
                "characterClass"
            ).value.trim(),

        level:
            Number(
                document.getElementById(
                    "characterLevel"
                ).value
            ) || 1,

        image:
            document.getElementById(
                "characterImage"
            ).value.trim(),

        description:
            document.getElementById(
                "characterDescription"
            ).value.trim(),

        notes:
            document.getElementById(
                "characterNotes"
            ).value.trim(),

        createdAt:
            existing?.createdAt ||
            new Date().toISOString(),

        updatedAt:
            new Date().toISOString()

    };


    await put(
        "characters",
        character
    );


    closeModal();

    showToast(
        characterId
            ? "Character updated."
            : "Character created."
    );


    render();

}


async function deleteCharacter(id) {

    if (
        !confirm(
            "Delete this character?"
        )
    ) {
        return;
    }


    await del(
        "characters",
        id
    );


    showToast(
        "Character deleted."
    );


    render();

}


/* =========================================================
   COMBAT
   ========================================================= */

function normalizeCombat(combat) {

    return {

        ...combat,

        status:
            combat.status ||
            "draft",

        round:
            Number(combat.round) ||
            1,

        turnIndex:
            Number(combat.turnIndex) ||
            0,

        p:
            Array.isArray(combat.p)
                ? combat.p.map(
                    participant => ({

                        id:
                            participant.id ||
                            makeId("participant"),

                        n:
                            participant.n ||
                            participant.name ||
                            "Unnamed",

                        i:
                            Number(
                                participant.i
                            ) || 0,

                        h:
                            Number(
                                participant.h
                            ) || 0,

                        m:
                            Number(
                                participant.m
                            ) ||
                            Number(
                                participant.h
                            ) ||
                            1,

                        a:
                            Number(
                                participant.a
                            ) || 10,

                        tempHp:
                            Number(
                                participant.tempHp
                            ) || 0,

                        conditions:
                            participant.conditions ||
                            "",

                        notes:
                            participant.notes ||
                            "",

                        hidden:
                            Boolean(
                                participant.hidden
                            ),

                        isPlayer:
                            Boolean(
                                participant.isPlayer
                            )

                    })
                )
                : []

    };

}


async function renderCombat() {

    const page =
        document.getElementById(
            "page"
        );


    let combats =
        await getMyRecords(
            "combats"
        );


    combats =
        combats.map(
            normalizeCombat
        );


    for (
        const combat of combats
    ) {

        await put(
            "combats",
            combat
        );

    }


    const active =
        combats.find(
            c =>
                c.status ===
                "active"
        );


    const drafts =
        combats.filter(
            c =>
                c.status ===
                "draft"
        );


    const ended =
        combats.filter(
            c =>
                c.status ===
                "ended"
        );


    page.innerHTML = `

        <div class="toolbar">

            <div>

                <h1 class="page-title">
                    Combat
                </h1>

                <p class="page-subtitle">
                    Run encounters and track the battlefield.
                </p>

            </div>


            <div class="toolbar-right">

                <button
                    class="secondary-button"
                    onclick="showCombatForm()">

                    + Create Encounter

                </button>


                <button
                    class="primary-button"
                    onclick="startCombatModal()">

                    ⚔ Start Combat

                </button>

            </div>

        </div>


        ${
            active
                ? renderActiveCombat(active)
                : `
                    <div class="card empty-state">

                        <strong>
                            No Active Combat
                        </strong>

                        Create an encounter,
                        then start it when ready.

                    </div>
                `
        }


        ${
            drafts.length
                ? `

                    <div class="card">

                        <h2>
                            Prepared Encounters
                        </h2>

                        ${drafts
                            .map(
                                renderCombatSummary
                            )
                            .join("")}

                    </div>

                `
                : ""
        }


        ${
            ended.length
                ? `

                    <div class="card">

                        <h2>
                            Combat History
                        </h2>

                        ${ended
                            .map(
                                renderCombatSummary
                            )
                            .join("")}

                    </div>

                `
                : ""
        }

    `;

}


function renderCombatSummary(
    combat
) {

    return `

        <div class="card combat-card">

            <div class="card-header">

                <div>

                    <span
                        class="
                            combat-status
                            ${esc(combat.status)}
                        ">

                        ${esc(combat.status)}

                    </span>


                    <h3 style="margin-top:8px">

                        ${esc(combat.name)}

                    </h3>

                    <div>
                        ${combat.p.length}
                        participant(s)
                    </div>

                </div>


                <div class="toolbar-right">

                    ${
                        combat.status ===
                        "draft"
                            ? `

                                <button
                                    class="small-button"
                                    onclick="
                                        showCombatForm(
                                            '${combat.id}'
                                        )
                                    ">

                                    Edit

                                </button>


                                <button
                                    class="small-button"
                                    onclick="
                                        startSpecificCombat(
                                            '${combat.id}'
                                        )
                                    ">

                                    Start

                                </button>

                            `
                            : `
                                <button
                                    class="small-button"
                                    onclick="
                                        showCombatForm(
                                            '${combat.id}'
                                        )
                                    ">

                                    View / Edit

                                </button>
                            `
                    }


                    <button
                        class="small-button"
                        onclick="
                            deleteCombat(
                                '${combat.id}'
                            )
                        ">

                        Delete

                    </button>

                </div>

            </div>

        </div>

    `;

}


function renderActiveCombat(
    combat
) {

    const participants =
        [...combat.p].sort(
            (a,b) =>
                Number(b.i) -
                Number(a.i)
        );


    return `

        <div class="card combat-card active-combat">

            <div class="card-header">

                <div>

                    <span class="combat-status active">
                        Active
                    </span>

                    <h2 style="margin-top:8px">
                        ${esc(combat.name)}
                    </h2>

                    <strong>
                        Round ${combat.round}
                    </strong>

                </div>


                <div class="toolbar-right">

                    <button
                        class="secondary-button"
                        onclick="
                            showCombatForm(
                                '${combat.id}'
                            )
                        ">

                        Edit Combat

                    </button>


                    <button
                        class="secondary-button"
                        onclick="
                            previousTurn(
                                '${combat.id}'
                            )
                        ">

                        ← Previous

                    </button>


                    <button
                        class="primary-button"
                        onclick="
                            nextTurn(
                                '${combat.id}'
                            )
                        ">

                        Next Turn →

                    </button>


                    <button
                        class="danger-button"
                        onclick="
                            endCombat(
                                '${combat.id}'
                            )
                        ">

                        End Combat

                    </button>

                </div>

            </div>


            <div class="toolbar">

                <button
                    class="secondary-button"
                    onclick="
                        nextRound(
                            '${combat.id}'
                        )
                    ">

                    Next Round

                </button>


                <button
                    class="primary-button"
                    onclick="
                        showParticipantForm(
                            '${combat.id}'
                        )
                    ">

                    + Add Participant

                </button>

            </div>


            <div class="table-wrap">

                <table>

                    <thead>

                        <tr>

                            <th>Turn</th>
                            <th>Initiative</th>
                            <th>Combatant</th>
                            <th>HP</th>
                            <th>Health</th>
                            <th>Damage</th>
                            <th>AC</th>
                            <th>Conditions</th>
                            <th>Actions</th>

                        </tr>

                    </thead>


                    <tbody>

                        ${
                            participants
                                .map(
                                    (p,index) =>
                                        renderCombatParticipant(
                                            combat,
                                            p,
                                            index
                                        )
                                )
                                .join("")
                        }

                    </tbody>

                </table>

            </div>

        </div>

    `;

}


function renderCombatParticipant(
    combat,
    participant,
    sortedIndex
) {

    const isTurn =
        sortedIndex ===
        combat.turnIndex;


    const max =
        Math.max(
            Number(participant.m) ||
            1,
            1
        );


    const hp =
        Math.max(
            Number(participant.h) ||
            0,
            0
        );


    const percent =
        Math.max(
            0,
            Math.min(
                100,
                hp / max * 100
            )
        );


    let healthClass = "";


    if (percent <= 25) {

        healthClass =
            "critical";

    } else if (percent <= 50) {

        healthClass =
            "low";

    }


    return `

        <tr
            class="
                ${isTurn
                    ? "turn-indicator"
                    : ""}
            ">

            <td>
                ${
                    isTurn
                        ? "⚔"
                        : ""
                }
            </td>


            <td>
                ${esc(participant.i)}
            </td>


            <td>

                <strong>
                    ${esc(participant.n)}
                </strong>

            </td>


            <td>

                ${hp} / ${max}

                ${
                    participant.tempHp
                        ? `
                            <br>
                            <small>
                                +${participant.tempHp}
                                temp
                            </small>
                        `
                        : ""
                }

            </td>


            <td>

                <div class="hp-bar">

                    <div
                        class="
                            hp-fill
                            ${healthClass}
                        "
                        style="
                            width:${percent}%
                        ">
                    </div>

                </div>

            </td>


            <td>

                <div class="damage-control">

                    <input
    type="number"
    min="0"
    placeholder="Damage"
    id="damage_${combat.id}_${participant.id}"
    onkeydown="
        if(event.key === 'Enter'){
            applyDamage(
                '${combat.id}',
                '${participant.id}',
                this
            );
        }
    ">


                   <button
    class="small-button"
    onclick="
        applyDamage(
            '${combat.id}',
            '${participant.id}',
            document.getElementById(
                'damage_${combat.id}_${participant.id}'
            )
        )
    ">

    Apply

</button>

                </div>


                <button
                    class="small-button"
                    style="margin-top:4px"
                    onclick="
                        showHealForm(
                            '${combat.id}',
                            '${participant.id}'
                        )
                    ">

                    Heal

                </button>

            </td>


            <td>
                ${esc(participant.a)}
            </td>


            <td>
                ${
                    participant.conditions
                        ? esc(
                            participant.conditions
                        )
                        : "—"
                }
            </td>


            <td>

                <button
                    class="small-button"
                    onclick="
                        showParticipantForm(
                            '${combat.id}',
                            '${participant.id}'
                        )
                    ">

                    Edit

                </button>


                <button
                    class="small-button"
                    onclick="
                        removeParticipant(
                            '${combat.id}',
                            '${participant.id}'
                        )
                    ">

                    ×

                </button>

            </td>

        </tr>

    `;

}


/* =========================================================
   COMBAT FORMS
   ========================================================= */

async function showCombatForm(
    combatId=null
) {

    const combat =
        combatId
            ? normalizeCombat(
                await one(
                    "combats",
                    combatId
                )
            )
            : null;


    openModal(

        combat
            ? "Edit Encounter"
            : "Create Encounter",

        `

        <form
            onsubmit="
                saveCombat(
                    event,
                    '${combatId || ""}'
                )
            ">

            <div class="form-grid">

                <div class="form-field full">

                    <label>
                        Encounter Name
                    </label>

                    <input
                        id="combatName"
                        required
                        value="${esc(
                            combat?.name ||
                            ""
                        )}"
                        placeholder="Goblin Ambush">

                </div>


                <div class="form-field full">

                    <label>
                        Encounter Notes
                    </label>

                    <textarea
                        id="combatNotes">${esc(
                            combat?.notes ||
                            ""
                        )}</textarea>

                </div>

            </div>


            <div class="card">

                <h3>
                    Participants
                </h3>

                ${
                    combat?.p?.length
                        ? combat.p
                            .map(
                                p =>
                                    `
                                    <div class="toolbar">

                                        <strong>
                                            ${esc(p.n)}
                                        </strong>

                                        <span>
                                            Initiative:
                                            ${esc(p.i)}
                                            |
                                            HP:
                                            ${esc(p.h)}
                                            /
                                            ${esc(p.m)}
                                        </span>

                                    </div>
                                    `
                            )
                            .join("")
                        : `
                            <p>
                                Add participants after creating
                                the encounter.
                            </p>
                        `
                }

            </div>


            ${modalFormButtons()}

        </form>

        `
    );

}


async function saveCombat(
    event,
    combatId
) {

    event.preventDefault();


    const existing =
        combatId
            ? normalizeCombat(
                await one(
                    "combats",
                    combatId
                )
            )
            : null;


    const combat = {

        id:
            combatId ||
            makeId("combat"),

        ownerId:
            currentUserId,

        campaignId:
            currentCampaignId,

        name:
            document.getElementById(
                "combatName"
            ).value.trim(),

        notes:
            document.getElementById(
                "combatNotes"
            ).value.trim(),

        status:
            existing?.status ||
            "draft",

        round:
            existing?.round ||
            1,

        turnIndex:
            existing?.turnIndex ||
            0,

        p:
            existing?.p ||
            [],

        createdAt:
            existing?.createdAt ||
            new Date().toISOString(),

        updatedAt:
            new Date().toISOString(),

        endedAt:
            existing?.endedAt ||
            null

    };


    await put(
        "combats",
        combat
    );


    closeModal();


    showToast(
        combatId
            ? "Encounter updated."
            : "Encounter created."
    );


    render();

}


async function startCombatModal() {

    const combats =
        (await getMyRecords(
            "combats"
        ))
        .filter(
            c =>
                !c.status ||
                c.status ===
                "draft"
        );


    if (!combats.length) {

        showToast(
            "Create an encounter first."
        );

        return;

    }


    openModal(

        "Start Combat",

        `

        <div class="form-field">

            <label>
                Encounter
            </label>

            <select id="startCombatSelect">

                ${combats
                    .map(
                        c =>
                            `
                            <option
                                value="${esc(c.id)}">

                                ${esc(c.name)}

                            </option>
                            `
                    )
                    .join("")}

            </select>

        </div>


        <div class="form-actions">

            <button
                class="secondary-button"
                onclick="closeModal()">

                Cancel

            </button>


            <button
                class="primary-button"
                onclick="confirmStartCombat()">

                ⚔ Start Combat

            </button>

        </div>

        `
    );

}


async function confirmStartCombat() {

    const combatId =
        document.getElementById(
            "startCombatSelect"
        ).value;


    await startSpecificCombat(
        combatId
    );

}


async function startSpecificCombat(
    combatId
) {

    const combats =
        await getMyRecords(
            "combats"
        );


    const active =
        combats.find(
            c =>
                c.status ===
                "active"
        );


    if (active) {

        showToast(
            "End the current combat first."
        );

        closeModal();

        return;

    }


    const combat =
        normalizeCombat(
            await one(
                "combats",
                combatId
            )
        );


    if (!combat) {
        return;
    }


    combat.status =
        "active";


    combat.round =
        1;


    combat.turnIndex =
        0;


    combat.p.sort(
        (a,b) =>
            Number(b.i) -
            Number(a.i)
    );


    await put(
        "combats",
        combat
    );


    closeModal();


    showToast(
        "Combat started!"
    );


    render();

}


async function endCombat(
    combatId
) {

    const combat =
        normalizeCombat(
            await one(
                "combats",
                combatId
            )
        );


    if (!combat) {
        return;
    }


    if (
        !confirm(
            "End this combat and save it to history?"
        )
    ) {
        return;
    }


    combat.status =
        "ended";


    combat.endedAt =
        new Date().toISOString();


    await put(
        "combats",
        combat
    );


    showToast(
        "Combat ended."
    );


    render();

}


async function nextTurn(
    combatId
) {

    const combat =
        normalizeCombat(
            await one(
                "combats",
                combatId
            )
        );


    if (
        !combat ||
        !combat.p.length
    ) {
        return;
    }


    combat.turnIndex++;


    if (
        combat.turnIndex >=
        combat.p.length
    ) {

        combat.turnIndex =
            0;

        combat.round++;

    }


    await put(
        "combats",
        combat
    );


    render();

}


async function previousTurn(
    combatId
) {

    const combat =
        normalizeCombat(
            await one(
                "combats",
                combatId
            )
        );


    if (
        !combat ||
        !combat.p.length
    ) {
        return;
    }


    combat.turnIndex--;


    if (
        combat.turnIndex < 0
    ) {

        combat.turnIndex =
            combat.p.length - 1;

        combat.round =
            Math.max(
                1,
                combat.round - 1
            );

    }


    await put(
        "combats",
        combat
    );


    render();

}


async function nextRound(
    combatId
) {

    const combat =
        normalizeCombat(
            await one(
                "combats",
                combatId
            )
        );


    if (!combat) {
        return;
    }


    combat.round++;

    combat.turnIndex =
        0;


    await put(
        "combats",
        combat
    );


    render();

}


/* =========================================================
   DAMAGE
   ========================================================= */

async function applyDamage(
    combatId,
    participantId,
    input
) {

    if (!input) {
        return;
    }


    const damage =
        Math.max(
            0,
            Number(input.value) || 0
        );


    if (!damage) {
        showToast(
            "Enter a damage value first."
        );

        return;
    }


    const combat =
        normalizeCombat(
            await one(
                "combats",
                combatId
            )
        );


    if (!combat) {
        showToast(
            "Combat encounter could not be found."
        );

        return;
    }


    const participant =
        combat.p.find(
            p =>
                p.id ===
                participantId
        );


    if (!participant) {
        showToast(
            "Combatant could not be found."
        );

        return;
    }


    let remaining =
        damage;


    /*
       Temporary HP absorbs damage first.
    */

    if (
        participant.tempHp >
        0
    ) {

        const absorbed =
            Math.min(
                participant.tempHp,
                remaining
            );


        participant.tempHp -=
            absorbed;


        remaining -=
            absorbed;

    }


    participant.h =
        Math.max(
            0,
            Number(participant.h || 0) -
            remaining
        );


    await put(
        "combats",
        combat
    );


    input.value =
        "";


    showToast(
        participant.n +
        " took " +
        damage +
        " damage."
    );


    render();

}


/* =========================================================
   HEAL FORM
   ========================================================= */

async function showHealForm(
    combatId,
    participantId
) {

    openModal(

        "Restore Hit Points",

        `

        <form
            onsubmit="
                applyHeal(
                    event,
                    '${combatId}',
                    '${participantId}'
                )
            ">

            <div class="form-field">

                <label>
                    Healing Amount
                </label>

                <input
                    id="healAmount"
                    type="number"
                    min="1"
                    required
                    autofocus>

            </div>


            ${modalFormButtons()}

        </form>

        `
    );

}


async function applyHeal(
    event,
    combatId,
    participantId
) {

    event.preventDefault();


    const amount =
        Math.max(
            0,
            Number(
                document.getElementById(
                    "healAmount"
                ).value
            ) || 0
        );


    const combat =
        normalizeCombat(
            await one(
                "combats",
                combatId
            )
        );


    const participant =
        combat?.p.find(
            p =>
                p.id ===
                participantId
        );


    if (
        !participant ||
        !amount
    ) {
        return;
    }


    participant.h =
        Math.min(
            participant.m,
            participant.h +
            amount
        );


    await put(
        "combats",
        combat
    );


    closeModal();


    showToast(
        participant.n +
        " recovered " +
        amount +
        " HP."
    );


    render();

}


/* =========================================================
   PARTICIPANTS
   ========================================================= */

async function showParticipantForm(
    combatId,
    participantId=null
) {

    const combat =
        normalizeCombat(
            await one(
                "combats",
                combatId
            )
        );


    const participant =
        participantId
            ? combat.p.find(
                p =>
                    p.id ===
                    participantId
            )
            : null;


    openModal(

        participant
            ? "Edit Combatant"
            : "Add Combatant",

        `

        <form
            onsubmit="
                saveParticipant(
                    event,
                    '${combatId}',
                    '${participantId || ""}'
                )
            ">

            <div class="form-grid">

                <div class="form-field full">

                    <label>
                        Name
                    </label>

                    <input
                        id="participantName"
                        required
                        value="${esc(
                            participant?.n ||
                            ""
                        )}">

                </div>


                <div class="form-field">

                    <label>
                        Initiative
                    </label>

                    <input
                        id="participantInitiative"
                        type="number"
                        value="${esc(
                            participant?.i ||
                            0
                        )}">

                </div>


                <div class="form-field">

                    <label>
                        Armor Class
                    </label>

                    <input
                        id="participantAC"
                        type="number"
                        value="${esc(
                            participant?.a ||
                            10
                        )}">

                </div>


                <div class="form-field">

                    <label>
                        Current HP
                    </label>

                    <input
                        id="participantHP"
                        type="number"
                        min="0"
                        value="${esc(
                            participant?.h ||
                            10
                        )}">

                </div>


                <div class="form-field">

                    <label>
                        Maximum HP
                    </label>

                    <input
                        id="participantMaxHP"
                        type="number"
                        min="1"
                        value="${esc(
                            participant?.m ||
                            10
                        )}">

                </div>


                <div class="form-field">

                    <label>
                        Temporary HP
                    </label>

                    <input
                        id="participantTempHP"
                        type="number"
                        min="0"
                        value="${esc(
                            participant?.tempHp ||
                            0
                        )}">

                </div>


                <div class="form-field">

                    <label>
                        Conditions
                    </label>

                    <input
                        id="participantConditions"
                        value="${esc(
                            participant?.conditions ||
                            ""
                        )}"
                        placeholder="Poisoned, Prone...">

                </div>


                <div class="form-field full">

                    <label>
                        Notes
                    </label>

                    <textarea
                        id="participantNotes">${esc(
                            participant?.notes ||
                            ""
                        )}</textarea>

                </div>


                <div class="checkbox-row">

                    <input
                        id="participantPlayer"
                        type="checkbox"
                        ${
                            participant?.isPlayer
                                ? "checked"
                                : ""
                        }>

                    <label>
                        Player Character
                    </label>

                </div>


                <div class="checkbox-row">

                    <input
                        id="participantHidden"
                        type="checkbox"
                        ${
                            participant?.hidden
                                ? "checked"
                                : ""
                        }>

                    <label>
                        Hidden from Players
                    </label>

                </div>

            </div>


            ${modalFormButtons()}

        </form>

        `
    );

}


async function saveParticipant(
    event,
    combatId,
    participantId
) {

    event.preventDefault();


    const combat =
        normalizeCombat(
            await one(
                "combats",
                combatId
            )
        );


    const maxHP =
        Math.max(
            1,
            Number(
                document.getElementById(
                    "participantMaxHP"
                ).value
            ) || 1
        );


    const participant = {

        id:
            participantId ||
            makeId("participant"),

        n:
            document.getElementById(
                "participantName"
            ).value.trim(),

        i:
            Number(
                document.getElementById(
                    "participantInitiative"
                ).value
            ) || 0,

        h:
            Math.min(
                maxHP,
                Math.max(
                    0,
                    Number(
                        document.getElementById(
                            "participantHP"
                        ).value
                    ) || 0
                )
            ),

        m:
            maxHP,

        a:
            Number(
                document.getElementById(
                    "participantAC"
                ).value
            ) || 10,

        tempHp:
            Math.max(
                0,
                Number(
                    document.getElementById(
                        "participantTempHP"
                    ).value
                ) || 0
            ),

        conditions:
            document.getElementById(
                "participantConditions"
            ).value.trim(),

        notes:
            document.getElementById(
                "participantNotes"
            ).value.trim(),

        isPlayer:
            document.getElementById(
                "participantPlayer"
            ).checked,

        hidden:
            document.getElementById(
                "participantHidden"
            ).checked

    };


    if (participantId) {

        const index =
            combat.p.findIndex(
                p =>
                    p.id ===
                    participantId
            );


        combat.p[index] =
            participant;

    } else {

        combat.p.push(
            participant
        );

    }


    combat.p.sort(
        (a,b) =>
            Number(b.i) -
            Number(a.i)
    );


    await put(
        "combats",
        combat
    );


    closeModal();


    showToast(
        participantId
            ? "Combatant updated."
            : "Combatant added."
    );


    render();

}


async function removeParticipant(
    combatId,
    participantId
) {

    const combat =
        normalizeCombat(
            await one(
                "combats",
                combatId
            )
        );


    const participant =
        combat?.p.find(
            p =>
                p.id ===
                participantId
        );


    if (!participant) {
        return;
    }


    if (
        !confirm(
            "Remove " +
            participant.n +
            "?"
        )
    ) {
        return;
    }


    combat.p =
        combat.p.filter(
            p =>
                p.id !==
                participantId
        );


    await put(
        "combats",
        combat
    );


    render();

}


async function deleteCombat(
    combatId
) {

    if (
        !confirm(
            "Delete this encounter?"
        )
    ) {
        return;
    }


    await del(
        "combats",
        combatId
    );


    render();

}


/* =========================================================
   MAPS
   ========================================================= */

async function renderMaps() {

    const page =
        document.getElementById(
            "page"
        );


    const maps =
        await getMyRecords(
            "maps"
        );


    page.innerHTML = `

        <div class="toolbar">

            <div>

                <h1 class="page-title">
                    Maps
                </h1>

                <p class="page-subtitle">
                    World and battle maps.
                </p>

            </div>


            <button
                class="primary-button"
                onclick="showMapForm()">

                + Add Map

            </button>

        </div>


        ${
            maps.length
                ? maps
                    .map(
                        map =>
                            `
                            <div class="card">

                                <div class="card-header">

                                    <div>

                                        <h2>
                                            ${esc(map.name)}
                                        </h2>

                                        <p>
                                            ${esc(
                                                map.description ||
                                                ""
                                            )}
                                        </p>

                                    </div>


                                    <div>

                                        <button
                                            class="small-button"
                                            onclick="
                                                showMapForm(
                                                    '${map.id}'
                                                )
                                            ">

                                            Edit

                                        </button>


                                        <button
                                            class="small-button"
                                            onclick="
                                                deleteMap(
                                                    '${map.id}'
                                                )
                                            ">

                                            Delete

                                        </button>

                                    </div>

                                </div>


                                ${
                                    map.image
                                        ? `
                                            <img
                                                class="map-image"
                                                src="${esc(
                                                    map.image
                                                )}">
                                        `
                                        : ""
                                }

                            </div>
                            `
                    )
                    .join("")
                : `
                    <div class="empty-state">

                        <strong>
                            No Maps
                        </strong>

                        Add a map to your campaign.

                    </div>
                `
        }

    `;

}


async function showMapForm(
    mapId=null
) {

    const map =
        mapId
            ? await one(
                "maps",
                mapId
            )
            : null;


    openModal(

        map
            ? "Edit Map"
            : "Add Map",

        `

        <form
            onsubmit="
                saveMap(
                    event,
                    '${mapId || ""}'
                )
            ">

            <div class="form-grid">

                <div class="form-field full">

                    <label>
                        Map Name
                    </label>

                    <input
                        id="mapName"
                        required
                        value="${esc(
                            map?.name ||
                            ""
                        )}">

                </div>


                <div class="form-field full">

                    <label>
                        Image URL
                    </label>

                    <input
                        id="mapImage"
                        required
                        value="${esc(
                            map?.image ||
                            ""
                        )}">

                </div>


                <div class="form-field full">

                    <label>
                        Description
                    </label>

                    <textarea
                        id="mapDescription">${esc(
                            map?.description ||
                            ""
                        )}</textarea>

                </div>

            </div>


            ${modalFormButtons()}

        </form>

        `
    );

}


async function saveMap(
    event,
    mapId
) {

    event.preventDefault();


    const existing =
        mapId
            ? await one(
                "maps",
                mapId
            )
            : null;


    const map = {

        id:
            mapId ||
            makeId("map"),

        ownerId:
            currentUserId,

        campaignId:
            currentCampaignId,

        name:
            document.getElementById(
                "mapName"
            ).value.trim(),

        image:
            document.getElementById(
                "mapImage"
            ).value.trim(),

        description:
            document.getElementById(
                "mapDescription"
            ).value.trim(),

        createdAt:
            existing?.createdAt ||
            new Date().toISOString(),

        updatedAt:
            new Date().toISOString()

    };


    await put(
        "maps",
        map
    );


    closeModal();

    showToast(
        "Map saved."
    );


    render();

}


async function deleteMap(id) {

    if (
        !confirm(
            "Delete this map?"
        )
    ) {
        return;
    }


    await del(
        "maps",
        id
    );


    render();

}


/* =========================================================
   SESSIONS
   ========================================================= */

async function renderSessions() {

    const page =
        document.getElementById(
            "page"
        );


    const sessions =
        await getMyRecords(
            "sessions"
        );


    page.innerHTML = `

        <div class="toolbar">

            <div>

                <h1 class="page-title">
                    Sessions
                </h1>

                <p class="page-subtitle">
                    Your campaign history.
                </p>

            </div>


            <button
                class="primary-button"
                onclick="showSessionForm()">

                + Add Session

            </button>

        </div>


        ${
            sessions.length
                ? sessions
                    .map(
                        session =>
                            `
                            <div class="card">

                                <div class="card-header">

                                    <div>

                                        <h2>
                                            Session
                                            ${esc(
                                                session.number ||
                                                ""
                                            )}
                                        </h2>

                                        <small>
                                            ${esc(
                                                session.date ||
                                                ""
                                            )}
                                        </small>

                                    </div>


                                    <div>

                                        <button
                                            class="small-button"
                                            onclick="
                                                showSessionForm(
                                                    '${session.id}'
                                                )
                                            ">

                                            Edit

                                        </button>


                                        <button
                                            class="small-button"
                                            onclick="
                                                deleteSession(
                                                    '${session.id}'
                                                )
                                            ">

                                            Delete

                                        </button>

                                    </div>

                                </div>


                                <p>
                                    ${esc(
                                        session.summary ||
                                        ""
                                    )}
                                </p>


                                ${
                                    session.events
                                        ? `
                                            <h3>
                                                Events
                                            </h3>

                                            <p>
                                                ${esc(
                                                    session.events
                                                )}
                                            </p>
                                        `
                                        : ""
                                }


                                ${
                                    session.unresolved
                                        ? `
                                            <h3>
                                                Unresolved
                                            </h3>

                                            <p>
                                                ${esc(
                                                    session.unresolved
                                                )}
                                            </p>
                                        `
                                        : ""
                                }

                            </div>
                            `
                    )
                    .join("")
                : `
                    <div class="empty-state">

                        <strong>
                            No Sessions
                        </strong>

                        Add your first session log.

                    </div>
                `
        }

    `;

}


async function showSessionForm(
    sessionId=null
) {

    const session =
        sessionId
            ? await one(
                "sessions",
                sessionId
            )
            : null;


    openModal(

        session
            ? "Edit Session"
            : "Add Session",

        `

        <form
            onsubmit="
                saveSession(
                    event,
                    '${sessionId || ""}'
                )
            ">

            <div class="form-grid">

                <div class="form-field">

                    <label>
                        Session Number
                    </label>

                    <input
                        id="sessionNumber"
                        type="number"
                        value="${esc(
                            session?.number ||
                            ""
                        )}">

                </div>


                <div class="form-field">

                    <label>
                        Date
                    </label>

                    <input
                        id="sessionDate"
                        type="date"
                        value="${esc(
                            session?.date ||
                            ""
                        )}">

                </div>


                <div class="form-field full">

                    <label>
                        Summary
                    </label>

                    <textarea
                        id="sessionSummary">${esc(
                            session?.summary ||
                            ""
                        )}</textarea>

                </div>


                <div class="form-field full">

                    <label>
                        Events
                    </label>

                    <textarea
                        id="sessionEvents">${esc(
                            session?.events ||
                            ""
                        )}</textarea>

                </div>


                <div class="form-field full">

                    <label>
                        Unresolved Issues
                    </label>

                    <textarea
                        id="sessionUnresolved">${esc(
                            session?.unresolved ||
                            ""
                        )}</textarea>

                </div>

            </div>


            ${modalFormButtons()}

        </form>

        `
    );

}


async function saveSession(
    event,
    sessionId
) {

    event.preventDefault();


    const existing =
        sessionId
            ? await one(
                "sessions",
                sessionId
            )
            : null;


    const session = {

        id:
            sessionId ||
            makeId("session"),

        ownerId:
            currentUserId,

        campaignId:
            currentCampaignId,

        number:
            document.getElementById(
                "sessionNumber"
            ).value,

        date:
            document.getElementById(
                "sessionDate"
            ).value,

        summary:
            document.getElementById(
                "sessionSummary"
            ).value.trim(),

        events:
            document.getElementById(
                "sessionEvents"
            ).value.trim(),

        unresolved:
            document.getElementById(
                "sessionUnresolved"
            ).value.trim(),

        createdAt:
            existing?.createdAt ||
            new Date().toISOString(),

        updatedAt:
            new Date().toISOString()

    };


    await put(
        "sessions",
        session
    );


    closeModal();

    showToast(
        "Session saved."
    );


    render();

}


async function deleteSession(id) {

    if (
        !confirm(
            "Delete this session?"
        )
    ) {
        return;
    }


    await del(
        "sessions",
        id
    );


    render();

}


/* =========================================================
   DICE
   ========================================================= */

function renderDice() {

    document.getElementById(
        "page"
    ).innerHTML = `

        <h1 class="page-title">
            Dice Roller
        </h1>

        <p class="page-subtitle">
            Roll dice for your game.
        </p>


        <div class="card">

            <div class="form-grid">

                <div class="form-field">

                    <label>
                        Number of Dice
                    </label>

                    <input
                        id="diceCount"
                        type="number"
                        min="1"
                        max="100"
                        value="1">

                </div>


                <div class="form-field">

                    <label>
                        Die
                    </label>

                    <select id="diceSides">

                        <option value="4">
                            d4
                        </option>

                        <option value="6" selected>
                            d6
                        </option>

                        <option value="8">
                            d8
                        </option>

                        <option value="10">
                            d10
                        </option>

                        <option value="12">
                            d12
                        </option>

                        <option value="20">
                            d20
                        </option>

                        <option value="100">
                            d100
                        </option>

                    </select>

                </div>


                <div class="form-field">

                    <label>
                        Modifier
                    </label>

                    <input
                        id="diceModifier"
                        type="number"
                        value="0">

                </div>

            </div>


            <div class="form-actions">

                <button
                    class="primary-button"
                    onclick="rollDice()">

                    🎲 Roll

                </button>

            </div>

        </div>


        <div
            id="diceResult"
            class="dice-result">

            Ready

        </div>

    `;

}


function rollDice() {

    const count =
        Math.max(
            1,
            Math.min(
                100,
                Number(
                    document.getElementById(
                        "diceCount"
                    ).value
                ) || 1
            )
        );


    const sides =
        Number(
            document.getElementById(
                "diceSides"
            ).value
        );


    const modifier =
        Number(
            document.getElementById(
                "diceModifier"
            ).value
        ) || 0;


    const rolls = [];


    for (
        let i=0;
        i<count;
        i++
    ) {

        rolls.push(
            Math.floor(
                Math.random() *
                sides
            ) + 1
        );

    }


    const total =
        rolls.reduce(
            (sum,value) =>
                sum + value,
            0
        ) +
        modifier;


    document.getElementById(
        "diceResult"
    ).innerHTML = `

        ${total}

        <div style="
            font-size:15px;
            margin-top:10px;
            color:var(--muted);
        ">

            Rolls:
            ${rolls.join(", ")}

            ${
                modifier
                    ? `
                        <br>
                        Modifier:
                        ${
                            modifier > 0
                                ? "+"
                                : ""
                        }${modifier}
                    `
                    : ""
            }

        </div>

    `;

}


/* =========================================================
   GENERATORS
   ========================================================= */

function renderGenerators() {

    document.getElementById(
        "page"
    ).innerHTML = `

        <h1 class="page-title">
            Generators
        </h1>

        <p class="page-subtitle">
            Generate names and campaign ideas.
        </p>


        <div class="card">

            <h2>
                Name Generator
            </h2>


            <div class="form-grid">

                <div class="form-field">

                    <label>
                        Theme
                    </label>

                    <input
                        id="nameTheme"
                        value="fantasy">

                </div>


                <div class="form-field">

                    <label>
                        Number of Names
                    </label>

                    <input
                        id="nameCount"
                        type="number"
                        min="1"
                        max="20"
                        value="5">

                </div>

            </div>


            <div class="form-actions">

                <button
                    class="primary-button"
                    onclick="generateNames()">

                    Generate Names

                </button>

            </div>


            <div
                id="nameOutput"
                class="generator-output">

                Your names will appear here.

            </div>

        </div>


        <div class="card">

            <h2>
                Town Generator
            </h2>


            <div class="form-grid">

                <div class="form-field">

                    <label>
                        Theme
                    </label>

                    <input
                        id="townTheme"
                        value="fantasy">

                </div>


                <div class="form-field">

                    <label>
                        Size
                    </label>

                    <select id="townSize">

                        <option>
                            Village
                        </option>

                        <option selected>
                            Town
                        </option>

                        <option>
                            City
                        </option>

                    </select>

                </div>

            </div>


            <div class="form-actions">

                <button
                    class="primary-button"
                    onclick="generateTown()">

                    Generate Town

                </button>

            </div>


            <div
                id="townOutput"
                class="generator-output">

                Your town will appear here.

            </div>

        </div>

    `;

}


function generateNames() {

    const theme =
        document.getElementById(
            "nameTheme"
        ).value.trim().toLowerCase();


    const count =
        Math.max(
            1,
            Math.min(
                20,
                Number(
                    document.getElementById(
                        "nameCount"
                    ).value
                ) || 5
            )
        );


    const pools = {

        fantasy: [
            "Ael",
            "Thar",
            "Mor",
            "Eld",
            "Val",
            "Kael",
            "Ryn",
            "Syl",
            "Vor",
            "Dra"
        ],

        nordic: [
            "Bjorn",
            "Eir",
            "Hal",
            "Rag",
            "Sven",
            "Tor",
            "Ulfr",
            "Yr"
        ],

        desert: [
            "Zar",
            "Rash",
            "Sam",
            "Nad",
            "Qad",
            "Az",
            "Mal",
            "Jah"
        ]

    };


    const endings = [
        "en",
        "ar",
        "is",
        "or",
        "an",
        "iel",
        "a",
        "os",
        "in",
        "eth"
    ];


    const pool =
        pools[theme] ||
        pools.fantasy;


    const names = [];


    for (
        let i=0;
        i<count;
        i++
    ) {

        names.push(

            pool[
                Math.floor(
                    Math.random() *
                    pool.length
                )
            ] +

            endings[
                Math.floor(
                    Math.random() *
                    endings.length
                )
            ]

        );

    }


    document.getElementById(
        "nameOutput"
    ).innerHTML =
        names
            .map(
                name =>
                    `<div>✦ ${esc(name)}</div>`
            )
            .join("");

}


function generateTown() {

    const theme =
        document.getElementById(
            "townTheme"
        ).value.trim();


    const size =
        document.getElementById(
            "townSize"
        ).value;


    const starts = [
        "Stone",
        "Raven",
        "Oak",
        "Silver",
        "Dragon",
        "Black",
        "High",
        "Green",
        "Moon",
        "Iron"
    ];


    const endings = [
        "ford",
        "haven",
        "watch",
        "fall",
        "hold",
        "mere",
        "wick",
        "reach",
        "stead",
        "rest"
    ];


    const name =
        starts[
            Math.floor(
                Math.random() *
                starts.length
            )
        ] +
        endings[
            Math.floor(
                Math.random() *
                endings.length
            )
        ];


    const industries = [
        "farming",
        "mining",
        "fishing",
        "trade",
        "logging",
        "crafting"
    ];


    const problems = [
        "A nearby ruin has recently been disturbed.",
        "Merchants have started disappearing.",
        "A local faction is gaining influence.",
        "Strange lights have appeared outside town.",
        "A valuable shipment has gone missing.",
        "Something has been frightening travelers."
    ];


    const industry =
        industries[
            Math.floor(
                Math.random() *
                industries.length
            )
        ];


    const problem =
        problems[
            Math.floor(
                Math.random() *
                problems.length
            )
        ];


    document.getElementById(
        "townOutput"
    ).innerHTML = `

        <h3>
            ${esc(name)}
        </h3>

        <p>
            <strong>
                Theme:
            </strong>
            ${esc(theme)}
        </p>

        <p>
            <strong>
                Size:
            </strong>
            ${esc(size)}
        </p>

        <p>
            <strong>
                Industry:
            </strong>
            ${esc(industry)}
        </p>

        <p>
            <strong>
                Adventure Hook:
            </strong>
            ${esc(problem)}
        </p>

    `;

}


/* =========================================================
   SETTINGS
   ========================================================= */

async function renderSettings() {

    const page =
        document.getElementById(
            "page"
        );


    const account =
        await one(
            "accounts",
            currentUserId
        );


    const campaigns =
        await getMyCampaigns();


    page.innerHTML = `

        <h1 class="page-title">
            Settings
        </h1>


        <div class="card">

            <h2>
                Account
            </h2>

            <p>
                Logged in as:
                <strong>
                    ${esc(
                        account?.username ||
                        ""
                    )}
                </strong>
            </p>


            <button
                class="danger-button"
                onclick="logout()">

                Log Out

            </button>

        </div>


        <div class="card">

            <h2>
                Campaigns
            </h2>


            ${
                campaigns.length
                    ? campaigns
                        .map(
                            c =>
                                `
                                <div class="toolbar">

                                    <strong>
                                        ${esc(c.name)}
                                    </strong>

                                    <div>

                                        <button
                                            class="small-button"
                                            onclick="
                                                showCampaignForm(
                                                    '${c.id}'
                                                )
                                            ">

                                            Edit

                                        </button>


                                        <button
                                            class="small-button"
                                            onclick="
                                                deleteCampaign(
                                                    '${c.id}'
                                                )
                                            ">

                                            Delete

                                        </button>

                                    </div>

                                </div>
                                `
                        )
                        .join("")
                    : `
                        <p>
                            No campaigns.
                        </p>
                    `
            }

        </div>


        <div class="card">

            <h2>
                Local Data
            </h2>

            <p>
                Campaign data is stored locally in this
                browser. Logging out does not delete it.
            </p>

            <button
                class="primary-button"
                onclick="exportAccountData()">

                Export Account Backup

            </button>

        </div>


        <div class="card">

            <h2>
                Data Folder
            </h2>

            <p>
                You can choose a folder on your computer
                where DM Toolkit can save a JSON backup.
            </p>

            <button
                class="secondary-button"
                onclick="chooseDataFolder()">

                Choose Data Folder

            </button>

            <span
                id="folderStatus"
                style="
                    margin-left:10px;
                    color:var(--muted);
                ">

                No folder linked.

            </span>

        </div>

    `;


    updateFolderStatus();

}


async function deleteCampaign(
    campaignId
) {

    if (
        !confirm(
            "Delete this campaign?"
        )
    ) {
        return;
    }


    const stores = [
        "entries",
        "characters",
        "combats",
        "maps",
        "sessions"
    ];


    for (
        const storeName of stores
    ) {

        const records =
            await all(
                storeName
            );


        for (
            const record of records
        ) {

            if (
                record.campaignId ===
                campaignId
            ) {

                await del(
                    storeName,
                    record.id
                );

            }

        }

    }


    await del(
        "campaigns",
        campaignId
    );


    if (
        currentCampaignId ===
        campaignId
    ) {

        currentCampaignId =
            null;

    }


    showToast(
        "Campaign deleted."
    );


    render();

}


/* =========================================================
   EXPORT
   ========================================================= */

async function collectAccountData() {

    const campaigns =
        await getMyCampaigns();


    const campaignIds =
        new Set(
            campaigns.map(
                c => c.id
            )
        );


    const result = {

        version: 3,

        exportedAt:
            new Date().toISOString(),

        account:
            await one(
                "accounts",
                currentUserId
            ),

        campaigns,

        entries: [],
        characters: [],
        combats: [],
        maps: [],
        sessions: []

    };


    for (
        const storeName of [
            "entries",
            "characters",
            "combats",
            "maps",
            "sessions"
        ]
    ) {

        const records =
            await all(
                storeName
            );


        result[storeName] =
            records.filter(
                record =>
                    record.ownerId ===
                    currentUserId &&
                    campaignIds.has(
                        record.campaignId
                    )
            );

    }


    /*
       Do not export the password.
    */

    if (result.account) {

        delete result.account.password;

    }


    return result;

}


async function exportAccountData() {

    const data =
        await collectAccountData();


    downloadJSON(
        data,
        "dm-toolkit-account-backup.json"
    );


    showToast(
        "Account backup exported."
    );

}


async function exportCampaign() {

    if (!currentCampaignId) {

        showToast(
            "Open a campaign first."
        );

        return;

    }


    const data =
        await collectAccountData();


    data.campaigns =
        data.campaigns.filter(
            c =>
                c.id ===
                currentCampaignId
        );


    const campaignIds =
        new Set([
            currentCampaignId
        ]);


    for (
        const storeName of [
            "entries",
            "characters",
            "combats",
            "maps",
            "sessions"
        ]
    ) {

        data[storeName] =
            data[storeName].filter(
                record =>
                    campaignIds.has(
                        record.campaignId
                    )
            );

    }


    downloadJSON(
        data,
        "dm-toolkit-campaign.json"
    );


    showToast(
        "Campaign exported."
    );

}


function downloadJSON(
    data,
    filename
) {

    const blob =
        new Blob(
            [
                JSON.stringify(
                    data,
                    null,
                    2
                )
            ],
            {
                type:
                    "application/json"
            }
        );


    const url =
        URL.createObjectURL(
            blob
        );


    const link =
        document.createElement(
            "a"
        );


    link.href =
        url;

    link.download =
        filename;


    link.click();


    URL.revokeObjectURL(
        url
    );

}


/* =========================================================
   IMPORT
   ========================================================= */

async function importCampaign(
    input
) {

    const file =
        input.files?.[0];


    if (!file) {
        return;
    }


    try {

        const text =
            await file.text();


        const data =
            JSON.parse(text);


        if (
            !data.campaigns ||
            !Array.isArray(
                data.campaigns
            )
        ) {

            throw new Error(
                "Invalid campaign backup."
            );

        }


        const campaignMap =
            new Map();


        for (
            const oldCampaign
            of data.campaigns
        ) {

            const newCampaign = {

                ...oldCampaign,

                id:
                    makeId("campaign"),

                ownerId:
                    currentUserId

            };


            campaignMap.set(
                oldCampaign.id,
                newCampaign.id
            );


            await put(
                "campaigns",
                newCampaign
            );


            currentCampaignId =
                newCampaign.id;

        }


        for (
            const storeName
            of [
                "entries",
                "characters",
                "combats",
                "maps",
                "sessions"
            ]
        ) {

            const records =
                Array.isArray(
                    data[storeName]
                )
                    ? data[storeName]
                    : [];


            for (
                const oldRecord
                of records
            ) {

                const newRecord = {

                    ...oldRecord,

                    id:
                        makeId(
                            storeName
                        ),

                    ownerId:
                        currentUserId,

                    campaignId:
                        campaignMap.get(
                            oldRecord.campaignId
                        ) ||
                        currentCampaignId

                };


                await put(
                    storeName,
                    newRecord
                );

            }

        }


        await updateCampaignTitle();


        showToast(
            "Import complete."
        );


        render();


    } catch(error) {

        console.error(error);


        showToast(
            "Could not import that file."
        );

    }


    input.value = "";

}


/* =========================================================
   OPTIONAL PHYSICAL DATA FOLDER
   ========================================================= */

async function chooseDataFolder() {

    /*
       Chrome's File System Access API allows the user
       to explicitly give this application access to
       a folder.

       The browser does NOT allow us to silently choose
       the folder containing index.html.
    */

    if (
        !window.showDirectoryPicker
    ) {

        showToast(
            "This browser does not support linked data folders."
        );

        return;

    }


    try {

        const handle =
            await window.showDirectoryPicker();


        const permission =
            await handle.requestPermission({
                mode: "readwrite"
            });


        if (
            permission !==
            "granted"
        ) {

            showToast(
                "Folder permission was not granted."
            );

            return;

        }


        /*
           Store the directory handle locally.
        */

        await put(
            "settings",
            {
                id:
                    "dataFolder",
                handle
            }
        );


        await writeDataFolderBackup(
            handle
        );


        updateFolderStatus();


        showToast(
            "Data folder linked."
        );


    } catch(error) {

        console.log(
            "Folder selection cancelled."
        );

    }

}


async function writeDataFolderBackup(
    handle
) {

    if (!handle) {
        return;
    }


    try {

        const data =
            await collectAccountData();


        const fileHandle =
            await handle.getFileHandle(
                "dm-toolkit-data.json",
                {
                    create: true
                }
            );


        const writable =
            await fileHandle.createWritable();


        await writable.write(
            JSON.stringify(
                data,
                null,
                2
            )
        );


        await writable.close();


    } catch(error) {

        console.error(
            "Could not write folder backup:",
            error
        );

    }

}


async function getDataFolderHandle() {

    try {

        const setting =
            await one(
                "settings",
                "dataFolder"
            );


        return setting?.handle ||
            null;

    } catch {

        return null;

    }

}


async function updateFolderStatus() {

    const status =
        document.getElementById(
            "folderStatus"
        );


    if (!status) {
        return;
    }


    const handle =
        await getDataFolderHandle();


    status.textContent =
        handle
            ? "Linked: " + handle.name
            : "No folder linked.";

}


/* =========================================================
   STARTUP
   ========================================================= */

async function init() {

    try {

        /*
           IndexedDB version 2 creates the new
           accounts store while keeping the old
           campaign data.
        */

        await openDB();


        /*
           The settings store was not part of the
           original database.

           It cannot be created without another
           database version upgrade, so the physical
           folder feature will gracefully fall back
           if that store is unavailable.

           The core account/campaign system does not
           depend on it.
        */

        await restoreLogin();


    } catch(error) {

        console.error(
            error
        );


        document.getElementById(
            "authScreen"
        ).innerHTML = `

            <div class="auth-card">

                <div class="auth-dragon">
                    ⚠️
                </div>

                <h1>
                    Database Error
                </h1>

                <p>
                    DM Toolkit could not open its
                    local database.
                </p>

                <p>
                    ${esc(error.message)}
                </p>

            </div>

        `;

    }

}


init();