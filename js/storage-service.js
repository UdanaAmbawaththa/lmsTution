(() => {
    const LMS = window.TuitionLMS;
    const FIREBASE_SDK_VERSION = "11.0.2";
    const LOCAL_KEYS = {
        SESSION: "tuition_lms_session_v1",
        MATERIALS: "tuition_lms_materials_v1",
        SUBJECTS: "tuition_lms_subjects_v1",
        PASS_OVERRIDES: "tuition_lms_demo_passwords_v1"
    };

    const IDB_NAME = "TuitionLMSFiles";
    const IDB_STORE = "pdfs";

    /* ---------------- Safe Storage Helpers (work even on file://) ---------------- */
    const memoryStorage = new Map();
    const memoryFiles = new Map();

    function storageGet(key) {
        try {
            return window.localStorage.getItem(key);
        } catch {
            return memoryStorage.has(key) ? memoryStorage.get(key) : null;
        }
    }

    function storageSet(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch {
            memoryStorage.set(key, value);
        }
    }

    function storageRemove(key) {
        try {
            window.localStorage.removeItem(key);
        } catch {
            memoryStorage.delete(key);
        }
    }

    /**
     * Generates a minimal valid single-page PDF Blob for seeded demo materials
     * so students can preview and download real PDFs immediately in Demo Mode.
     */
    function createSamplePdfBlob(title, subject, description) {
        const safeText = (str) => String(str || "")
            .replace(/[^\x20-\x7E]/g, " ")
            .replace(/\\/g, "\\\\")
            .replace(/\(/g, "\\(")
            .replace(/\)/g, "\\)")
            .slice(0, 75);

        const lines = [
            `Tuition LMS - Study Material`,
            `Title: ${safeText(title)}`,
            `Subject: ${safeText(subject)}`,
            `Summary: ${safeText(description)}`,
            `Prepared for enrolled students.`,
            `Created by Udana Ambawaththa.`
        ];

        const streamOps = [
            "BT",
            "/F1 18 Tf",
            "50 750 Td",
            `(${lines[0]}) Tj`,
            "/F1 13 Tf",
            "0 -32 Td",
            `(${lines[1]}) Tj`,
            "0 -22 Td",
            `(${lines[2]}) Tj`,
            "/F1 11 Tf",
            "0 -26 Td",
            `(${lines[3]}) Tj`,
            "0 -22 Td",
            `(${lines[4]}) Tj`,
            "0 -36 Td",
            `(${lines[5]}) Tj`,
            "ET"
        ].join("\n");

        const objects = [
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
            `4 0 obj\n<< /Length ${streamOps.length} >>\nstream\n${streamOps}\nendstream\nendobj\n`,
            "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
        ];

        let pdf = "%PDF-1.4\n";
        const offsets = [0];
        for (const obj of objects) {
            offsets.push(pdf.length);
            pdf += obj;
        }
        const xrefStart = pdf.length;
        pdf += `xref\n0 ${objects.length + 1}\n`;
        pdf += "0000000000 65535 f \n";
        for (let i = 1; i < offsets.length; i++) {
            pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
        }
        pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
        return new Blob([pdf], { type: "application/pdf" });
    }

    /* ---------------- IndexedDB Helper for Demo PDF Blobs ---------------- */
    function openFileDb() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error("IndexedDB unavailable"));
                return;
            }
            const req = window.indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function idbPutFile(key, blob) {
        memoryFiles.set(key, blob);
        try {
            const db = await openFileDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, "readwrite");
                tx.objectStore(IDB_STORE).put(blob, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        } catch {
            // Kept in memoryFiles fallback if IndexedDB is blocked on file://
        }
    }

    async function idbGetFile(key) {
        try {
            const db = await openFileDb();
            const found = await new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, "readonly");
                const req = tx.objectStore(IDB_STORE).get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
            if (found) return found;
        } catch {
            // Fall back to in-memory map
        }
        return memoryFiles.get(key) || null;
    }

    async function idbDeleteFile(key) {
        memoryFiles.delete(key);
        try {
            const db = await openFileDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, "readwrite");
                tx.objectStore(IDB_STORE).delete(key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        } catch {
            // Ignore
        }
    }

    /* ---------------- Seed Data for Demo Mode ---------------- */
    const DEFAULT_SUBJECTS = [
        { id: "sub_math", name: "Combined Mathematics" },
        { id: "sub_physics", name: "Physics" },
        { id: "sub_chem", name: "Chemistry" },
        { id: "sub_ict", name: "ICT" }
    ];

    const DEFAULT_MATERIALS = [
        {
            id: "mat_1",
            title: "Differential Calculus - Complete Revision Notes",
            subject: "Combined Mathematics",
            grade: "A/L Batch 2026",
            topic: "Unit 04: Differentiation & Applications",
            description: "Comprehensive lecture tute covering chain rule, implicit differentiation, maxima/minima, and past paper worked examples.",
            fileName: "Differential_Calculus_Revision.pdf",
            fileSize: 245760,
            sourceType: "sample",
            fileUrl: "",
            storagePath: "",
            downloads: 42,
            publishedBy: "Admin",
            createdAt: Date.now() - 1000 * 60 * 60 * 24 * 5
        },
        {
            id: "mat_2",
            title: "Electrostatics & Gauss Law Tutorial Sheet",
            subject: "Physics",
            grade: "A/L Batch 2026",
            topic: "Unit 07: Electric Fields",
            description: "25 graded structured & MCQ practice problems with step-by-step marking scheme guidelines.",
            fileName: "Electrostatics_Tutorial_07.pdf",
            fileSize: 184320,
            sourceType: "sample",
            fileUrl: "",
            storagePath: "",
            downloads: 31,
            publishedBy: "Admin",
            createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2
        },
        {
            id: "mat_3",
            title: "Database Normalization & SQL Cheat Sheet",
            subject: "ICT",
            grade: "A/L Batch 2027",
            topic: "Module 09: Database Management",
            description: "Quick reference for 1NF, 2NF, 3NF decomposition and essential SQL JOIN / aggregation queries.",
            fileName: "ICT_SQL_Normalization_Guide.pdf",
            fileSize: 152400,
            sourceType: "sample",
            fileUrl: "",
            storagePath: "",
            downloads: 19,
            publishedBy: "Admin",
            createdAt: Date.now() - 1000 * 60 * 60 * 14
        }
    ];

    function ensureDemoSeeded() {
        if (!storageGet(LOCAL_KEYS.SUBJECTS)) {
            storageSet(LOCAL_KEYS.SUBJECTS, JSON.stringify(DEFAULT_SUBJECTS));
        }
        if (!storageGet(LOCAL_KEYS.MATERIALS)) {
            storageSet(LOCAL_KEYS.MATERIALS, JSON.stringify(DEFAULT_MATERIALS));
        }
    }

    /* ---------------- Firebase Runtime Loader ---------------- */
    let fbRuntime = null;

    async function getFirebaseRuntime() {
        if (fbRuntime) return fbRuntime;
        const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
        const [appMod, authMod, fsMod, stMod] = await Promise.all([
            import(`${base}/firebase-app.js`),
            import(`${base}/firebase-auth.js`),
            import(`${base}/firebase-firestore.js`),
            import(`${base}/firebase-storage.js`)
        ]);

        const app = appMod.getApps().length
            ? appMod.getApp()
            : appMod.initializeApp(LMS.FIREBASE_CONFIG);

        fbRuntime = {
            app,
            auth: authMod.getAuth(app),
            db: fsMod.getFirestore(app),
            storage: stMod.getStorage(app),
            authMod,
            fsMod,
            stMod
        };
        return fbRuntime;
    }

    function resolveRoleFromEmail(email) {
        if (!email) return null;
        const normalized = email.trim().toLowerCase();
        const isAdmin = LMS.AUTH_ROLES.ADMIN_EMAILS.some(
            (e) => e.trim().toLowerCase() === normalized
        );
        return isAdmin ? "admin" : "student";
    }

    function formatFirebaseError(err, fallbackMsg) {
        const code = err?.code || "";
        if (code === "auth/operation-not-allowed") {
            return new Error("Email/Password sign-in is not enabled yet in Firebase Authentication.");
        }
        if (code === "auth/user-not-found" || code === "auth/invalid-credential" || code === "auth/wrong-password") {
            return new Error("Invalid password or user account not created in Firebase Authentication.");
        }
        if (code === "auth/operation-not-supported-in-this-environment") {
            return new Error("Firebase Auth requires http://localhost or https:// (cannot run directly from file://).");
        }
        if (code === "auth/network-request-failed") {
            return new Error("Network error reaching Firebase. Please check your internet connection.");
        }
        if (code === "permission-denied") {
            return new Error("Firestore permission denied. Check that firestore.rules are published.");
        }
        return new Error(err?.message || fallbackMsg);
    }

    /* ---------------- Unified Service API ---------------- */
    LMS.lmsService = {
        isFirebaseMode() {
            return LMS.isFirebaseConfigured();
        },

        getDemoPasswords() {
            const saved = JSON.parse(storageGet(LOCAL_KEYS.PASS_OVERRIDES) || "{}");
            return {
                studentPass: saved.studentPass || LMS.DEMO_CONFIG.STUDENT_PASS,
                adminPass: saved.adminPass || LMS.DEMO_CONFIG.ADMIN_PASS,
                adminEmail: LMS.DEMO_CONFIG.ADMIN_EMAIL
            };
        },

        updateDemoStudentPassword(newPassword) {
            const saved = JSON.parse(storageGet(LOCAL_KEYS.PASS_OVERRIDES) || "{}");
            saved.studentPass = newPassword;
            storageSet(LOCAL_KEYS.PASS_OVERRIDES, JSON.stringify(saved));
        },

        async observeAuth(callback) {
            if (this.isFirebaseMode()) {
                const { auth, authMod } = await getFirebaseRuntime();
                return authMod.onAuthStateChanged(auth, (user) => {
                    if (!user) {
                        callback(null);
                        return;
                    }
                    const role = resolveRoleFromEmail(user.email);
                    callback({
                        uid: user.uid,
                        email: user.email,
                        role,
                        displayName: role === "admin" ? "Administrator" : "Student"
                    });
                });
            }

            ensureDemoSeeded();
            const raw = storageGet(LOCAL_KEYS.SESSION);
            callback(raw ? JSON.parse(raw) : null);
            return () => {};
        },

        async loginStudent(password) {
            const cleanPass = String(password || "");
            if (!cleanPass) {
                throw new Error("Please enter the student access password.");
            }

            if (this.isFirebaseMode()) {
                try {
                    const { auth, authMod } = await getFirebaseRuntime();
                    const cred = await authMod.signInWithEmailAndPassword(
                        auth,
                        LMS.AUTH_ROLES.STUDENT_AUTH_EMAIL,
                        cleanPass
                    );
                    return {
                        uid: cred.user.uid,
                        email: cred.user.email,
                        role: "student",
                        displayName: "Student"
                    };
                } catch (err) {
                    throw formatFirebaseError(err, "Student authentication failed.");
                }
            }

            const { studentPass } = this.getDemoPasswords();
            if (cleanPass !== studentPass) {
                throw new Error("Invalid student access password.");
            }
            const session = {
                uid: "demo-student",
                email: LMS.AUTH_ROLES.STUDENT_AUTH_EMAIL,
                role: "student",
                displayName: "Student"
            };
            storageSet(LOCAL_KEYS.SESSION, JSON.stringify(session));
            return session;
        },

        async loginAdmin(email, password) {
            const cleanEmail = String(email || "").trim();
            const cleanPass = String(password || "");
            if (!cleanEmail || !cleanPass) {
                throw new Error("Please enter both admin email and password.");
            }

            if (this.isFirebaseMode()) {
                try {
                    const { auth, authMod } = await getFirebaseRuntime();
                    const cred = await authMod.signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
                    const role = resolveRoleFromEmail(cred.user.email);
                    if (role !== "admin") {
                        await authMod.signOut(auth);
                        throw new Error("This account does not have Administrator privileges.");
                    }
                    return {
                        uid: cred.user.uid,
                        email: cred.user.email,
                        role: "admin",
                        displayName: "Administrator"
                    };
                } catch (err) {
                    if (err?.message === "This account does not have Administrator privileges.") {
                        throw err;
                    }
                    throw formatFirebaseError(err, "Administrator authentication failed.");
                }
            }

            const demo = this.getDemoPasswords();
            if (
                cleanEmail.toLowerCase() !== demo.adminEmail.toLowerCase() ||
                cleanPass !== demo.adminPass
            ) {
                throw new Error("Invalid administrator email or password.");
            }
            const session = {
                uid: "demo-admin",
                email: demo.adminEmail,
                role: "admin",
                displayName: "Administrator"
            };
            storageSet(LOCAL_KEYS.SESSION, JSON.stringify(session));
            return session;
        },

        async logout() {
            if (this.isFirebaseMode()) {
                const { auth, authMod } = await getFirebaseRuntime();
                await authMod.signOut(auth);
                return;
            }
            storageRemove(LOCAL_KEYS.SESSION);
        },

        async getSubjects() {
            if (this.isFirebaseMode()) {
                const { auth, db, fsMod } = await getFirebaseRuntime();
                const q = fsMod.query(
                    fsMod.collection(db, "subjects"),
                    fsMod.orderBy("name", "asc")
                );
                const snap = await fsMod.getDocs(q);
                if (snap.empty && resolveRoleFromEmail(auth.currentUser?.email) === "admin") {
                    const seeded = [];
                    for (const sub of DEFAULT_SUBJECTS) {
                        const ref = await fsMod.addDoc(fsMod.collection(db, "subjects"), {
                            name: sub.name,
                            createdAt: Date.now()
                        });
                        seeded.push({ id: ref.id, name: sub.name });
                    }
                    return seeded.sort((a, b) => a.name.localeCompare(b.name));
                }
                return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            }
            ensureDemoSeeded();
            return JSON.parse(storageGet(LOCAL_KEYS.SUBJECTS) || "[]");
        },

        async addSubject(name) {
            const trimmed = String(name || "").trim();
            if (!trimmed) throw new Error("Subject name cannot be empty.");

            if (this.isFirebaseMode()) {
                const { db, fsMod } = await getFirebaseRuntime();
                const ref = await fsMod.addDoc(fsMod.collection(db, "subjects"), {
                    name: trimmed,
                    createdAt: Date.now()
                });
                return { id: ref.id, name: trimmed };
            }

            const list = await this.getSubjects();
            if (list.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
                throw new Error("This subject already exists.");
            }
            const created = { id: `sub_${Date.now()}`, name: trimmed };
            list.push(created);
            storageSet(LOCAL_KEYS.SUBJECTS, JSON.stringify(list));
            return created;
        },

        async deleteSubject(id) {
            if (this.isFirebaseMode()) {
                const { db, fsMod } = await getFirebaseRuntime();
                await fsMod.deleteDoc(fsMod.doc(db, "subjects", id));
                return;
            }
            const list = await this.getSubjects();
            const filtered = list.filter((s) => s.id !== id);
            storageSet(LOCAL_KEYS.SUBJECTS, JSON.stringify(filtered));
        },

        async getMaterials() {
            if (this.isFirebaseMode()) {
                const { db, fsMod } = await getFirebaseRuntime();
                const q = fsMod.query(
                    fsMod.collection(db, "materials"),
                    fsMod.orderBy("createdAt", "desc")
                );
                const snap = await fsMod.getDocs(q);
                return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            }
            ensureDemoSeeded();
            const items = JSON.parse(storageGet(LOCAL_KEYS.MATERIALS) || "[]");
            return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        },

        async publishMaterial(metadata) {
            const id = `mat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const typing = metadata.typing ? metadata.typing.trim() : "";

            if (this.isFirebaseMode()) {
                const { db, fsMod } = await getFirebaseRuntime();

                const docData = {
                    title: metadata.title.trim(),
                    subject: metadata.subject.trim(),
                    grade: metadata.grade.trim(),
                    topic: metadata.topic.trim(),
                    description: metadata.description.trim(),
                    typing,
                    sourceType: "typing",
                    fileName: "",
                    fileSize: 0,
                    fileUrl: "",
                    storagePath: "",
                    downloads: 0,
                    publishedBy: metadata.publishedBy || "Admin",
                    createdAt: Date.now()
                };

                const docRef = await fsMod.addDoc(fsMod.collection(db, "materials"), docData);
                return { id: docRef.id, ...docData };
            }

            const newItem = {
                id,
                title: metadata.title.trim(),
                subject: metadata.subject.trim(),
                grade: metadata.grade.trim(),
                topic: metadata.topic.trim(),
                description: metadata.description.trim(),
                typing,
                sourceType: "typing",
                fileName: "",
                fileSize: 0,
                fileUrl: "",
                storagePath: "",
                downloads: 0,
                publishedBy: metadata.publishedBy || "Admin",
                createdAt: Date.now()
            };

            const items = await this.getMaterials();
            items.unshift(newItem);
            storageSet(LOCAL_KEYS.MATERIALS, JSON.stringify(items));
            return newItem;
        },

        async updateMaterial(id, updates) {
            if (this.isFirebaseMode()) {
                const { db, fsMod } = await getFirebaseRuntime();
                await fsMod.updateDoc(fsMod.doc(db, "materials", id), {
                    title: updates.title.trim(),
                    subject: updates.subject.trim(),
                    grade: updates.grade.trim(),
                    topic: updates.topic.trim(),
                    description: updates.description.trim()
                });
                return;
            }

            const items = await this.getMaterials();
            const idx = items.findIndex((m) => m.id === id);
            if (idx !== -1) {
                items[idx] = {
                    ...items[idx],
                    title: updates.title.trim(),
                    subject: updates.subject.trim(),
                    grade: updates.grade.trim(),
                    topic: updates.topic.trim(),
                    description: updates.description.trim()
                };
                storageSet(LOCAL_KEYS.MATERIALS, JSON.stringify(items));
            }
        },

        async deleteMaterial(material) {
            if (this.isFirebaseMode()) {
                const { db, storage, fsMod, stMod } = await getFirebaseRuntime();
                if (material.storagePath) {
                    try {
                        await stMod.deleteObject(stMod.ref(storage, material.storagePath));
                    } catch {
                        // Ignore missing storage object
                    }
                }
                await fsMod.deleteDoc(fsMod.doc(db, "materials", material.id));
                return;
            }

            if (material.sourceType === "upload" && material.storagePath) {
                await idbDeleteFile(material.storagePath);
            }
            const items = await this.getMaterials();
            const filtered = items.filter((m) => m.id !== material.id);
            storageSet(LOCAL_KEYS.MATERIALS, JSON.stringify(filtered));
        },

        async incrementDownload(id) {
            if (this.isFirebaseMode()) {
                const { db, fsMod } = await getFirebaseRuntime();
                await fsMod.updateDoc(fsMod.doc(db, "materials", id), {
                    downloads: fsMod.increment(1)
                });
                return;
            }
            const items = await this.getMaterials();
            const idx = items.findIndex((m) => m.id === id);
            if (idx !== -1) {
                items[idx].downloads = (items[idx].downloads || 0) + 1;
                storageSet(LOCAL_KEYS.MATERIALS, JSON.stringify(items));
            }
        },

        async resolveMaterialFileUrl(material) {
            if (material.sourceType === "link" || (material.fileUrl && this.isFirebaseMode())) {
                return { url: material.fileUrl, revokeAfterUse: false };
            }
            if (material.sourceType === "upload" && material.storagePath) {
                const blob = await idbGetFile(material.storagePath);
                if (!blob) {
                    throw new Error("Local PDF file not found in browser storage.");
                }
                return { url: URL.createObjectURL(blob), revokeAfterUse: true };
            }
            const sampleBlob = createSamplePdfBlob(
                material.title,
                material.subject,
                material.description
            );
            return { url: URL.createObjectURL(sampleBlob), revokeAfterUse: true };
        }
    };
})();
