(() => {
    const { lmsService } = window.TuitionLMS;

    const state = {
        user: null,
        activePanel: "student",
        activeAdminTab: "publish",
        sourceMode: "typing",
        subjects: [],
        materials: [],
        studentFilter: {
            search: "",
            subject: "all",
            grade: "all",
            sort: "newest"
        },
        adminSearch: "",
        activePreviewObjectUrl: null,
        activePreviewMaterial: null
    };

    const $ = (id) => document.getElementById(id);

    /* ---------------- Helpers ---------------- */
    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = String(text ?? "");
        return div.innerHTML;
    }

    function formatBytes(bytes) {
        if (!bytes) return "External PDF";
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function formatDate(ts) {
        if (!ts) return "Recently";
        return new Date(ts).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function showToast(message, type = "info") {
        const container = $("toast-container");
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 3600);
    }

    /* ---------------- Theme Management ---------------- */
    function initTheme() {
        let saved = "light";
        try {
            saved = window.localStorage.getItem("tuition_lms_theme") || "light";
        } catch {
            saved = "light";
        }
        document.documentElement.setAttribute("data-theme", saved);
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute("data-theme") || "light";
        const next = current === "light" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", next);
        try {
            window.localStorage.setItem("tuition_lms_theme", next);
        } catch {
            // Ignore in restricted file:// contexts
        }
    }

    /* ---------------- Auth View & Role Tabs ---------------- */
    function setupAuthUi() {
        const roleTabs = document.querySelectorAll("[data-login-role]");
        const studentForm = $("student-login-form");
        const adminForm = $("admin-login-form");

        roleTabs.forEach((btn) => {
            btn.addEventListener("click", () => {
                const role = btn.dataset.loginRole;
                roleTabs.forEach((b) => {
                    const isActive = b === btn;
                    b.classList.toggle("active", isActive);
                    b.setAttribute("aria-selected", String(isActive));
                });
                studentForm.classList.toggle("hidden", role !== "student");
                adminForm.classList.toggle("hidden", role !== "admin");
                $("student-login-error").classList.add("hidden");
                $("admin-login-error").classList.add("hidden");
            });
        });

        document.querySelectorAll(".toggle-vis-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const input = $(btn.dataset.target);
                const show = input.type === "password";
                input.type = show ? "text" : "password";
                btn.textContent = show ? "Hide" : "Show";
            });
        });

        studentForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const errEl = $("student-login-error");
            const submitBtn = $("student-login-btn");
            errEl.classList.add("hidden");
            submitBtn.disabled = true;
            submitBtn.textContent = "Verifying...";

            try {
                const user = await lmsService.loginStudent($("student-password").value);
                studentForm.reset();
                await handleAuthenticatedUser(user);
                showToast("Welcome to the Student Learning Portal!", "success");
            } catch (err) {
                errEl.textContent = err.message || "Authentication failed.";
                errEl.classList.remove("hidden");
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = "Enter Student Panel";
            }
        });

        adminForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const errEl = $("admin-login-error");
            const submitBtn = $("admin-login-btn");
            errEl.classList.add("hidden");
            submitBtn.disabled = true;
            submitBtn.textContent = "Signing in...";

            try {
                const user = await lmsService.loginAdmin(
                    $("admin-email").value,
                    $("admin-password").value
                );
                adminForm.reset();
                await handleAuthenticatedUser(user);
                showToast("Signed in as Administrator (full access).", "success");
            } catch (err) {
                errEl.textContent = err.message || "Admin authentication failed.";
                errEl.classList.remove("hidden");
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = "Sign In to Admin & Student Panels";
            }
        });
    }

    function updateBackendModeIndicators() {
        const isFirebase = lmsService.isFirebaseMode();
        $("auth-mode-badge").textContent = "Digital Learning Portal";
        $("backend-status-text").textContent = "Learning Portal";
        $("adm-stat-mode").textContent = isFirebase ? "Firebase Live" : "Local Mode";

        const demoPassForm = $("demo-student-pass-form");
        const settingsInfo = $("settings-mode-info");

        if (isFirebase) {
            demoPassForm.classList.add("hidden");
            settingsInfo.innerHTML = `
                <strong>Firebase Cloud Mode is Active</strong><br>
                Authentication, Firestore database, and PDF Storage are connected to your Firebase project.
                To change the Student Access Password, update the student user's password in your Firebase Authentication console.
            `;
        } else {
            const creds = lmsService.getDemoPasswords();
            demoPassForm.classList.remove("hidden");
            $("new-demo-student-pass").value = creds.studentPass;
            settingsInfo.innerHTML = `
                <strong>Local Storage Mode is Active</strong><br>
                Data is stored locally in your browser (IndexedDB &amp; localStorage). To enable multi-device cloud sync,
                paste your Firebase project keys into <code>js/firebase-config.js</code> and host on HTTP/HTTPS.
            `;
        }
    }

    /* ---------------- Session & Role-Based Panel Control ---------------- */
    async function handleAuthenticatedUser(user) {
        state.user = user;
        if (!user) {
            $("auth-view").classList.remove("hidden");
            $("app-shell").classList.add("hidden");
            updateBackendModeIndicators();
            return;
        }

        $("auth-view").classList.add("hidden");
        $("app-shell").classList.remove("hidden");

        const isAdmin = user.role === "admin";
        const badge = $("user-role-badge");
        badge.textContent = isAdmin ? "Administrator" : "Student";
        badge.classList.toggle("admin", isAdmin);

        $("admin-panel-switcher").classList.toggle("hidden", !isAdmin);

        await refreshWorkspaceData();
        switchPanel(isAdmin ? "admin" : "student");
    }

    function switchPanel(targetPanel) {
        const isAdmin = state.user?.role === "admin";
        const resolvedPanel = targetPanel === "admin" && isAdmin ? "admin" : "student";
        state.activePanel = resolvedPanel;

        $("student-panel").classList.toggle("hidden", resolvedPanel !== "student");
        $("admin-panel").classList.toggle("hidden", resolvedPanel !== "admin");

        document.querySelectorAll(".switcher-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.panel === resolvedPanel);
        });

        const shortcutWrap = $("student-admin-shortcut-wrap");
        if (isAdmin && resolvedPanel === "student") {
            shortcutWrap.innerHTML = `
                <button type="button" id="back-to-admin-btn" class="btn btn-secondary">
                    &larr; Back to Admin Panel
                </button>
            `;
            $("back-to-admin-btn").addEventListener("click", () => switchPanel("admin"));
        } else {
            shortcutWrap.innerHTML = "";
        }
    }

    async function refreshWorkspaceData() {
        const [subjects, materials] = await Promise.all([
            lmsService.getSubjects(),
            lmsService.getMaterials()
        ]);
        state.subjects = subjects;
        state.materials = materials;
        renderAll();
    }

    function renderAll() {
        updateBackendModeIndicators();
        renderStats();
        renderSubjectOptions();
        renderStudentFilters();
        renderStudentMaterials();
        if (state.user?.role === "admin") {
            renderAdminMaterialsTable();
            renderAdminSubjectsList();
        }
    }

    function renderStats() {
        const total = state.materials.length;
        const subjectsCount = state.subjects.length;
        const downloads = state.materials.reduce((sum, m) => sum + (Number(m.downloads) || 0), 0);

        $("stu-stat-total").textContent = String(total);
        $("stu-stat-subjects").textContent = String(subjectsCount);
        $("stu-stat-downloads").textContent = String(downloads);

        $("adm-stat-total").textContent = String(total);
        $("adm-stat-subjects").textContent = String(subjectsCount);
        $("adm-stat-downloads").textContent = String(downloads);
    }

    function renderSubjectOptions() {
        const selectIds = ["mat-subject", "edit-mat-subject"];
        selectIds.forEach((id) => {
            const select = $(id);
            const current = select.value;
            select.innerHTML = state.subjects.length
                ? state.subjects
                    .map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`)
                    .join("")
                : `<option value="General">General</option>`;
            if (current && [...select.options].some((o) => o.value === current)) {
                select.value = current;
            }
        });
    }

    /* ---------------- Student Panel ---------------- */
    function renderStudentFilters() {
        const pillsEl = $("student-subject-pills");
        const subjectNames = ["all", ...state.subjects.map((s) => s.name)];
        if (!subjectNames.includes(state.studentFilter.subject)) {
            state.studentFilter.subject = "all";
        }

        pillsEl.innerHTML = subjectNames
            .map((sub) => {
                const active = state.studentFilter.subject === sub ? "active" : "";
                const label = sub === "all" ? "All Subjects" : sub;
                return `<button type="button" class="subject-pill ${active}" data-subject-pill="${escapeHtml(sub)}">${escapeHtml(label)}</button>`;
            })
            .join("");

        pillsEl.querySelectorAll("[data-subject-pill]").forEach((btn) => {
            btn.addEventListener("click", () => {
                state.studentFilter.subject = btn.dataset.subjectPill;
                renderStudentFilters();
                renderStudentMaterials();
            });
        });

        const gradeSelect = $("student-grade-filter");
        const grades = [...new Set(state.materials.map((m) => m.grade).filter(Boolean))].sort();
        const prevGrade = state.studentFilter.grade;
        gradeSelect.innerHTML = `<option value="all">All Batches / Grades</option>` +
            grades.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
        gradeSelect.value = grades.includes(prevGrade) ? prevGrade : "all";
        state.studentFilter.grade = gradeSelect.value;
    }

    function getFilteredStudentMaterials() {
        const { search, subject, grade, sort } = state.studentFilter;
        const q = search.trim().toLowerCase();

        let list = state.materials.filter((m) => {
            if (subject !== "all" && m.subject !== subject) return false;
            if (grade !== "all" && m.grade !== grade) return false;
            if (!q) return true;
            return [m.title, m.subject, m.grade, m.topic, m.description]
                .some((field) => String(field || "").toLowerCase().includes(q));
        });

        if (sort === "title") {
            list = [...list].sort((a, b) => a.title.localeCompare(b.title));
        } else if (sort === "downloads") {
            list = [...list].sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
        } else {
            list = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        }
        return list;
    }

    function renderStudentMaterials() {
        const grid = $("student-materials-grid");
        const empty = $("student-empty-state");
        const items = getFilteredStudentMaterials();

        if (!items.length) {
            grid.innerHTML = "";
            empty.classList.remove("hidden");
            return;
        }

        empty.classList.add("hidden");
        grid.innerHTML = items
            .map((m) => `
                <article class="material-card">
                    <div>
                        <div class="material-tags">
                            <span class="tag tag-subject">${escapeHtml(m.subject)}</span>
                            <span class="tag tag-grade">${escapeHtml(m.grade || "All Batches")}</span>
                        </div>
                        <h3 class="material-title">${escapeHtml(m.title)}</h3>
                        ${m.topic ? `<div class="material-topic">${escapeHtml(m.topic)}</div>` : ""}
                        <p class="material-desc">${escapeHtml(m.description || "Study material ready for viewing.")}</p>
                        ${m.typing ? `<div class="material-typing"><strong>Notes:</strong><pre style="white-space:pre-wrap;font-family:inherit;margin:0.5rem 0 0;">${escapeHtml(m.typing)}</pre></div>` : ""}
                    </div>
                    <div>
                        <div class="material-meta">
                            <span>PDF &bull; ${escapeHtml(formatBytes(m.fileSize))}</span>
                            <span>${Number(m.downloads) || 0} downloads &bull; ${escapeHtml(formatDate(m.createdAt))}</span>
                        </div>
                        <div class="material-actions" style="margin-top: 0.75rem;">
                            <button type="button" class="btn btn-outline btn-sm" data-preview-id="${escapeHtml(m.id)}">
                                Preview PDF
                            </button>
                            <button type="button" class="btn btn-primary btn-sm" data-download-id="${escapeHtml(m.id)}">
                                Download PDF
                            </button>
                        </div>
                    </div>
                </article>
            `)
            .join("");

        grid.querySelectorAll("[data-preview-id]").forEach((btn) => {
            btn.addEventListener("click", () => openPdfPreview(btn.dataset.previewId));
        });
        grid.querySelectorAll("[data-download-id]").forEach((btn) => {
            btn.addEventListener("click", () => downloadMaterialPdf(btn.dataset.downloadId));
        });
    }

    /* ---------------- PDF Preview & Download ---------------- */
    async function openPdfPreview(materialId) {
        const mat = state.materials.find((m) => m.id === materialId);
        if (!mat) return;

        try {
            cleanupPreviewObjectUrl();
            const resolved = await lmsService.resolveMaterialFileUrl(mat);
            if (resolved.revokeAfterUse) {
                state.activePreviewObjectUrl = resolved.url;
            }
            state.activePreviewMaterial = mat;

            $("pdf-modal-title").textContent = mat.title;
            $("pdf-modal-meta").textContent = `${mat.subject} • ${mat.grade || "General"} • ${mat.fileName || "Document.pdf"}`;
            $("pdf-preview-frame").src = resolved.url;
            $("pdf-modal").classList.remove("hidden");
        } catch (err) {
            showToast(err.message || "Unable to preview this PDF.", "error");
        }
    }

    function cleanupPreviewObjectUrl() {
        if (state.activePreviewObjectUrl) {
            URL.revokeObjectURL(state.activePreviewObjectUrl);
            state.activePreviewObjectUrl = null;
        }
        $("pdf-preview-frame").src = "about:blank";
    }

    async function downloadMaterialPdf(materialId) {
        const mat = state.materials.find((m) => m.id === materialId);
        if (!mat) return;

        try {
            const resolved = await lmsService.resolveMaterialFileUrl(mat);
            const link = document.createElement("a");
            link.href = resolved.url;
            link.download = mat.fileName?.toLowerCase().endsWith(".pdf")
                ? mat.fileName
                : `${mat.title.replace(/[^a-z0-9]+/gi, "_")}.pdf`;
            link.target = "_blank";
            link.rel = "noopener";
            document.body.appendChild(link);
            link.click();
            link.remove();

            if (resolved.revokeAfterUse) {
                setTimeout(() => URL.revokeObjectURL(resolved.url), 10000);
            }

            await lmsService.incrementDownload(mat.id);
            await refreshWorkspaceData();
            showToast(`Downloading "${mat.title}"`, "success");
        } catch (err) {
            showToast(err.message || "Download failed.", "error");
        }
    }

    /* ---------------- Admin Panel: Publish, Manage, Settings ---------------- */
    function setupAdminUi() {
        document.querySelectorAll(".switcher-btn").forEach((btn) => {
            btn.addEventListener("click", () => switchPanel(btn.dataset.panel));
        });

        $("quick-switch-student-btn").addEventListener("click", () => switchPanel("student"));

        document.querySelectorAll("[data-admin-tab]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const tab = btn.dataset.adminTab;
                state.activeAdminTab = tab;
                document.querySelectorAll("[data-admin-tab]").forEach((b) =>
                    b.classList.toggle("active", b === btn)
                );
                ["publish", "manage", "settings"].forEach((t) => {
                    $(`admin-tab-${t}`).classList.toggle("hidden", t !== tab);
                });
            });
        });

        $("publish-reset-btn").addEventListener("click", () => {
            $("mat-typing").value = "";
        });

        $("publish-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            if (state.user?.role !== "admin") return;

            const typingContent = $("mat-typing").value.trim();
            if (!typingContent) {
                showToast("Please enter some notes or content in the Typing section.", "error");
                return;
            }

            const submitBtn = $("publish-submit-btn");
            submitBtn.disabled = true;
            submitBtn.textContent = "Publishing...";

            try {
                await lmsService.publishMaterial({
                    title: $("mat-title").value,
                    subject: $("mat-subject").value,
                    grade: $("mat-grade").value,
                    topic: $("mat-topic").value,
                    description: $("mat-description").value,
                    typing: typingContent,
                    publishedBy: state.user.email || "Admin"
                });

                $("publish-form").reset();
                await refreshWorkspaceData();
                showToast("Learning material published successfully!", "success");
            } catch (err) {
                showToast(err.message || "Failed to publish material.", "error");
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = "Publish Material";
            }
        });

        $("admin-manage-search").addEventListener("input", (e) => {
            state.adminSearch = e.target.value;
            renderAdminMaterialsTable();
        });

        $("edit-material-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            if (state.user?.role !== "admin") return;

            const id = $("edit-mat-id").value;
            try {
                await lmsService.updateMaterial(id, {
                    title: $("edit-mat-title").value,
                    subject: $("edit-mat-subject").value,
                    grade: $("edit-mat-grade").value,
                    topic: $("edit-mat-topic").value,
                    description: $("edit-mat-description").value
                });
                $("edit-modal").classList.add("hidden");
                await refreshWorkspaceData();
                showToast("Material updated.", "success");
            } catch (err) {
                showToast(err.message || "Update failed.", "error");
            }
        });

        $("add-subject-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            if (state.user?.role !== "admin") return;
            try {
                await lmsService.addSubject($("new-subject-name").value);
                $("new-subject-name").value = "";
                await refreshWorkspaceData();
                showToast("Subject added.", "success");
            } catch (err) {
                showToast(err.message || "Could not add subject.", "error");
            }
        });

        $("demo-student-pass-form").addEventListener("submit", (e) => {
            e.preventDefault();
            if (state.user?.role !== "admin") return;
            const nextPass = $("new-demo-student-pass").value.trim();
            if (nextPass.length < 4) {
                showToast("Password must be at least 4 characters.", "error");
                return;
            }
            lmsService.updateDemoStudentPassword(nextPass);
            updateBackendModeIndicators();
            showToast("Demo student access password updated.", "success");
        });
    }

    function renderAdminMaterialsTable() {
        const tbody = $("admin-materials-tbody");
        const empty = $("admin-empty-state");
        const q = state.adminSearch.trim().toLowerCase();

        const filtered = state.materials.filter((m) => {
            if (!q) return true;
            return [m.title, m.subject, m.grade, m.topic]
                .some((v) => String(v || "").toLowerCase().includes(q));
        });

        if (!filtered.length) {
            tbody.innerHTML = "";
            empty.classList.remove("hidden");
            return;
        }

        empty.classList.add("hidden");
        tbody.innerHTML = filtered
            .map((m) => `
                <tr>
                    <td>
                        <strong>${escapeHtml(m.title)}</strong>
                        ${m.topic ? `<div class="muted" style="font-size:0.78rem;">${escapeHtml(m.topic)}</div>` : ""}
                    </td>
                    <td><span class="tag tag-subject">${escapeHtml(m.subject)}</span></td>
                    <td>${escapeHtml(m.grade || "-")}</td>
                    <td>${m.sourceType === "typing" ? "Typed Notes" : m.sourceType === "link" ? "External URL" : escapeHtml(formatBytes(m.fileSize))}</td>
                    <td>${Number(m.downloads) || 0}</td>
                    <td>${escapeHtml(formatDate(m.createdAt))}</td>
                    <td class="text-right">
                        <div class="table-actions">
                            <button type="button" class="btn btn-outline btn-sm" data-adm-preview="${escapeHtml(m.id)}">View</button>
                            <button type="button" class="btn btn-outline btn-sm" data-adm-edit="${escapeHtml(m.id)}">Edit</button>
                            <button type="button" class="btn btn-danger-ghost btn-sm" data-adm-delete="${escapeHtml(m.id)}">Delete</button>
                        </div>
                    </td>
                </tr>
            `)
            .join("");

        tbody.querySelectorAll("[data-adm-preview]").forEach((btn) => {
            btn.addEventListener("click", () => openPdfPreview(btn.dataset.admPreview));
        });
        tbody.querySelectorAll("[data-adm-edit]").forEach((btn) => {
            btn.addEventListener("click", () => openEditModal(btn.dataset.admEdit));
        });
        tbody.querySelectorAll("[data-adm-delete]").forEach((btn) => {
            btn.addEventListener("click", () => handleDeleteMaterial(btn.dataset.admDelete));
        });
    }

    function openEditModal(id) {
        const mat = state.materials.find((m) => m.id === id);
        if (!mat) return;
        $("edit-mat-id").value = mat.id;
        $("edit-mat-title").value = mat.title;
        $("edit-mat-subject").value = mat.subject;
        $("edit-mat-grade").value = mat.grade || "";
        $("edit-mat-topic").value = mat.topic || "";
        $("edit-mat-description").value = mat.description || "";
        $("edit-modal").classList.remove("hidden");
    }

    async function handleDeleteMaterial(id) {
        const mat = state.materials.find((m) => m.id === id);
        if (!mat) return;
        if (!confirm(`Delete "${mat.title}" permanently?`)) return;

        try {
            await lmsService.deleteMaterial(mat);
            await refreshWorkspaceData();
            showToast("Material deleted.", "success");
        } catch (err) {
            showToast(err.message || "Failed to delete material.", "error");
        }
    }

    function renderAdminSubjectsList() {
        const listEl = $("admin-subjects-list");
        listEl.innerHTML = state.subjects
            .map((s) => `
                <li>
                    <span>${escapeHtml(s.name)}</span>
                    <button type="button" class="btn btn-danger-ghost btn-sm" data-del-subject="${escapeHtml(s.id)}">
                        Remove
                    </button>
                </li>
            `)
            .join("");

        listEl.querySelectorAll("[data-del-subject]").forEach((btn) => {
            btn.addEventListener("click", async () => {
                if (state.subjects.length <= 1) {
                    showToast("At least one subject must remain.", "error");
                    return;
                }
                try {
                    await lmsService.deleteSubject(btn.dataset.delSubject);
                    await refreshWorkspaceData();
                    showToast("Subject removed.", "success");
                } catch (err) {
                    showToast(err.message || "Failed to remove subject.", "error");
                }
            });
        });
    }

    /* ---------------- Modals & Global Listeners ---------------- */
    function setupGlobalListeners() {
        $("auth-theme-toggle").addEventListener("click", toggleTheme);
        $("app-theme-toggle").addEventListener("click", toggleTheme);

        $("logout-btn").addEventListener("click", async () => {
            await lmsService.logout();
            state.user = null;
            await handleAuthenticatedUser(null);
            showToast("Logged out successfully.", "info");
        });

        $("student-search").addEventListener("input", (e) => {
            state.studentFilter.search = e.target.value;
            renderStudentMaterials();
        });
        $("student-grade-filter").addEventListener("change", (e) => {
            state.studentFilter.grade = e.target.value;
            renderStudentMaterials();
        });
        $("student-sort").addEventListener("change", (e) => {
            state.studentFilter.sort = e.target.value;
            renderStudentMaterials();
        });

        document.querySelectorAll("[data-close-modal]").forEach((el) => {
            el.addEventListener("click", () => {
                const modalId = el.dataset.closeModal;
                $(modalId).classList.add("hidden");
                if (modalId === "pdf-modal") {
                    cleanupPreviewObjectUrl();
                }
            });
        });

        $("pdf-modal-download-btn").addEventListener("click", () => {
            if (state.activePreviewMaterial) {
                downloadMaterialPdf(state.activePreviewMaterial.id);
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                $("pdf-modal").classList.add("hidden");
                $("edit-modal").classList.add("hidden");
                cleanupPreviewObjectUrl();
            }
        });
    }

    /* ---------------- Bootstrap ---------------- */
    async function bootstrap() {
        initTheme();
        document.querySelectorAll(".current-year").forEach((el) => {
            el.textContent = String(new Date().getFullYear());
        });

        setupAuthUi();
        setupAdminUi();
        setupGlobalListeners();
        updateBackendModeIndicators();

        try {
            await lmsService.observeAuth((user) => {
                handleAuthenticatedUser(user);
            });
        } catch (err) {
            showToast(err.message || "Error initializing authentication.", "error");
        }
    }

    bootstrap();
})();
