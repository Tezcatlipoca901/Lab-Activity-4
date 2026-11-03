<?php
/* =====================================================================
   Brewlist – Lab Activity 4 (PHP Sessions)
   Scope: CREATE a task + READ/VIEW tasks
   ===================================================================== */

session_start();                                   // keep tasks across page reloads
date_default_timezone_set('Asia/Manila');

/* ---------- Configuration ---------- */
// Category name => dot/chip color. Edit this list to add or remove categories.
$categories = [
    'School'   => '#cba6f7',
    'Personal' => '#a6e3a1',
    'Work'     => '#b794f6',
    'Others'   => '#6c7086',
];
const DEFAULT_CATEGORY = 'Others';

$viewNames = ['all' => 'All tasks', 'today' => 'Today', 'week' => 'This week', 'month' => 'This month', 'year' => 'This year'];
$viewIcons = ['all' => 'all-tasks', 'today' => 'today', 'week' => 'week', 'month' => 'month', 'year' => 'year'];
$sortNames = ['earliest' => 'Earliest first', 'latest' => 'Latest first', 'az' => 'Name A–Z', 'za' => 'Name Z–A'];

/* ---------- Session storage ---------- */
$_SESSION['tasks']   = $_SESSION['tasks']   ?? [];  // every task lives in $_SESSION['tasks']
$_SESSION['next_id'] = $_SESSION['next_id'] ?? 1;

/* ---------- Helpers ---------- */

// Output escaping (XSS protection) – use on EVERYTHING echoed into HTML.
function e($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function formatDate(string $date): string
{
    return $date !== '' ? date('M j, Y', strtotime($date)) : 'No due date';
}

function plural(int $n, string $word): string
{
    return $n . ' ' . $word . ($n === 1 ? '' : 's');
}

// Is the task's due date inside the chosen view (today / week / month / year)?
function inView(array $task, string $view): bool
{
    if ($view === 'all') return true;
    if ($task['due'] === '') return false;

    $due   = strtotime($task['due']);
    $today = strtotime('today');

    switch ($view) {
        case 'today': return $due === $today;
        case 'week':  return $due >= strtotime('monday this week', $today) && $due <= strtotime('sunday this week', $today);
        case 'month': return date('Y-m', $due) === date('Y-m', $today);
        case 'year':  return date('Y', $due) === date('Y', $today);
    }
    return true;
}

// Build a link that keeps the current filters but changes the given params (null = remove).
function url(array $changes = []): string
{
    $keep   = ['view', 'cat', 'status', 'sort', 'q', 'task', 'new'];
    $params = array_intersect_key($_GET, array_flip($keep));
    foreach ($changes as $key => $value) {
        if ($value === null || $value === '') unset($params[$key]);
        else $params[$key] = $value;
    }
    // drop values that are just the defaults, to keep URLs tidy
    if (($params['view'] ?? '') === 'all') unset($params['view']);
    if (($params['status'] ?? '') === 'all') unset($params['status']);
    if (($params['sort'] ?? '') === 'earliest') unset($params['sort']);

    return 'index.php' . ($params ? '?' . http_build_query($params) : '');
}

/* ---------- Filters from the query string (GET) ---------- */
$view      = in_array($_GET['view'] ?? 'all', array_keys($viewNames), true) ? ($_GET['view'] ?? 'all') : 'all';
$catFilter = isset($_GET['cat']) && isset($categories[$_GET['cat']]) ? $_GET['cat'] : null;
$status    = in_array($_GET['status'] ?? 'all', ['all', 'active', 'completed'], true) ? ($_GET['status'] ?? 'all') : 'all';
$sort      = isset($sortNames[$_GET['sort'] ?? '']) ? $_GET['sort'] : 'earliest';
$search    = trim($_GET['q'] ?? '');

/* =====================================================================
   CREATE  –  handle the self-submitting form (method="POST")
   ===================================================================== */
$errors = [];
$old    = ['title' => '', 'desc' => '', 'due' => '', 'cat' => DEFAULT_CATEGORY];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // 1. Extraction with null-coalescing fallback  2. Trimming extra spaces
    $old['title'] = trim($_POST['task_name'] ?? '');
    $old['desc']  = trim($_POST['task_description'] ?? '');
    $old['due']   = trim($_POST['due_date'] ?? '');
    $old['cat']   = trim($_POST['category'] ?? '');

    // 3. Server-side validation (collect messages in $errors)
    $errors = [];

    if ($old['title'] === '') {
        $errors['title'] = 'Task name is required.';
    } elseif (mb_strlen($old['title']) < 3) {
        $errors['title'] = 'Task name must be at least 3 characters long.';
    } elseif (mb_strlen($old['title']) > 80) {
        $errors['title'] = 'Task name cannot exceed 80 characters.';
    }

    if ($old['desc'] === '') {
        $errors['desc'] = 'Description is required.';
    } elseif (mb_strlen($old['desc']) > 255) {
        $errors['desc'] = 'Description cannot exceed 255 characters.';
    }

    if ($old['due'] !== '') {
        $d = DateTime::createFromFormat('Y-m-d', $old['due']);
        if (!$d || $d->format('Y-m-d') !== $old['due']) {
            $errors['due'] = 'Please enter a valid due date.';
        }
    }

    if (!isset($categories[$old['cat']])) {
        $errors['cat'] = 'Please choose a valid category.';
    }

    // 4. Save in $_SESSION, then redirect (Post/Redirect/Get) so a refresh doesn't resubmit
    if (!$errors) {
        $id = $_SESSION['next_id']++;
        $_SESSION['tasks'][$id] = [
            'id'    => $id,
            'title' => $old['title'],        // stored raw; escaped with e() when displayed
            'desc'  => $old['desc'],
            'cat'   => $old['cat'],
            'due'   => $old['due'],
            'done'  => false,
        ];
        header('Location: ' . url(['task' => $id, 'new' => null]));
        exit();
    }
}

/* =====================================================================
   READ  –  decide what the right panel shows, then build the list
   ===================================================================== */
$selectedId = isset($_GET['task']) ? (int) $_GET['task'] : 0;
$selected   = $_SESSION['tasks'][$selectedId] ?? null;
$showDetail = $selected !== null && !isset($_GET['new']) && $_SERVER['REQUEST_METHOD'] !== 'POST';

$allTasks = $_SESSION['tasks'];

// Sidebar counts: views respect the category filter, categories respect the view.
$viewCounts = [];
foreach ($viewNames as $key => $label) {
    $viewCounts[$key] = count(array_filter($allTasks, fn($t) => inView($t, $key) && (!$catFilter || $t['cat'] === $catFilter)));
}
$catCounts = [];
foreach ($categories as $name => $color) {
    $catCounts[$name] = count(array_filter($allTasks, fn($t) => $t['cat'] === $name && inView($t, $view)));
}

// Apply view, category, status and search filters.
$tasks = array_filter($allTasks, function ($t) use ($view, $catFilter, $status, $search) {
    if (!inView($t, $view)) return false;
    if ($catFilter && $t['cat'] !== $catFilter) return false;
    if ($status === 'active' && $t['done']) return false;
    if ($status === 'completed' && !$t['done']) return false;
    if ($search !== '' && stripos($t['title'] . ' ' . $t['desc'], $search) === false) return false;
    return true;
});

// Sort.
usort($tasks, function ($a, $b) use ($sort) {
    switch ($sort) {
        case 'az':     return strcasecmp($a['title'], $b['title']);
        case 'za':     return strcasecmp($b['title'], $a['title']);
        case 'latest': return [$a['due'] === '', $b['due']] <=> [$b['due'] === '', $a['due']];
        default:       return [$a['due'] === '', $a['due']] <=> [$b['due'] === '', $b['due']];   // earliest first
    }
});

$pageTitle = $viewNames[$view] . ($catFilter ? ' · ' . $catFilter : '');
$hasFilters = $view !== 'all' || $catFilter || $status !== 'all' || $search !== '';

// Small helper so the form can mark a field as invalid.
$bad = fn(string $field): string => isset($errors[$field]) ? ' bad' : '';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Brewlist</title>
  <link rel="icon" href="../assets/icons/brewlist.png">
  <link rel="stylesheet" href="../design/styles.css">
  <script src="../script/app.js" defer></script>
</head>
<body data-theme="mocha">

<header class="topbar">
  <a class="brand" href="index.php">
    <img src="../assets/icons/brewlist.png" alt="" class="brand-logo">
    <span class="brand-name">Brewlist</span>
  </a>
  <span class="brand-sep"></span>
  <span class="tagline">A cozy place to get things done.</span>

  <div class="theme-wrap">
    <button type="button" class="theme-btn" id="themeBtn" aria-haspopup="true" aria-expanded="false">
      <img src="../assets/icons/theme.png" alt="">
      <span id="themeLabel">Mocha</span>
      <svg class="chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <ul class="menu" id="themeMenu" hidden>
      <li><button type="button" data-theme="latte">Latte</button></li>
      <li><button type="button" data-theme="frappe">Frappé</button></li>
      <li><button type="button" data-theme="macchiato">Macchiato</button></li>
      <li><button type="button" data-theme="mocha">Mocha</button></li>
    </ul>
  </div>

  <!-- Search (GET form: ?q=...) keeps the other filters -->
  <form class="search-form" method="GET" action="index.php" role="search">
    <?php foreach (['view' => $view === 'all' ? '' : $view, 'cat' => $catFilter, 'status' => $status === 'all' ? '' : $status, 'sort' => $sort === 'earliest' ? '' : $sort] as $k => $v): ?>
      <?php if ($v): ?><input type="hidden" name="<?= e($k) ?>" value="<?= e($v) ?>"><?php endif; ?>
    <?php endforeach; ?>
    <label class="sr-only" for="q">Search tasks</label>
    <input class="search" id="q" name="q" type="search" placeholder="Search tasks..." value="<?= e($search) ?>" autocomplete="off">
  </form>
</header>

<div class="app">
  <!-- ================= Sidebar ================= -->
  <aside class="sidebar">
    <nav class="views">
      <?php foreach ($viewNames as $key => $label): $active = $view === $key; ?>
        <a class="nav-item<?= $active ? ' active' : '' ?>" href="<?= e(url(['view' => $key])) ?>">
          <img src="../assets/icons/<?= $viewIcons[$key] . ($active ? '-active' : '') ?>.png" alt="">
          <span><?= e($label) ?></span>
          <b class="count"><?= $viewCounts[$key] ?></b>
        </a>
      <?php endforeach; ?>
    </nav>

    <div class="side-divider"></div>

    <div class="cat-head">
      <span class="eyebrow-sm">Categories</span>
    </div>
    <?php if ($view !== 'all'): ?>
      <p class="cat-note">Filtering within <?= e($viewNames[$view]) ?>.</p>
    <?php endif; ?>
    <nav class="cats">
      <?php foreach ($categories as $name => $color): $active = $catFilter === $name; ?>
        <a class="nav-item cat-item<?= $active ? ' active' : '' ?>" href="<?= e(url(['cat' => $active ? null : $name])) ?>">
          <i class="dot" style="--c:<?= e($color) ?>"></i>
          <span><?= e($name) ?></span>
          <b class="count"><?= $catCounts[$name] ?></b>
        </a>
      <?php endforeach; ?>
    </nav>
  </aside>

  <!-- ================= Task list (READ) ================= -->
  <main class="main">
    <div class="main-head">
      <div>
        <div class="eyebrow">My tasks</div>
        <h1><?= e($pageTitle) ?></h1>
        <p class="sub"><?= plural(count($tasks), 'task') ?> in this view</p>
      </div>
      <a class="btn btn-primary btn-add" href="<?= e(url(['task' => null, 'new' => 1])) ?>">
        <svg viewBox="0 0 24 24" class="i"><path d="M12 5v14M5 12h14"/></svg>Add task
      </a>
    </div>

    <div class="toolbar">
      <div class="tabs" role="tablist">
        <?php foreach (['all' => 'All', 'active' => 'Active', 'completed' => 'Completed'] as $key => $label): ?>
          <a class="tab<?= $status === $key ? ' active' : '' ?>" role="tab" href="<?= e(url(['status' => $key])) ?>"><?= $label ?></a>
        <?php endforeach; ?>
      </div>
      <div class="sort">
        <span class="sort-label">Sort by</span>
        <div class="sort-wrap">
          <button type="button" class="sort-btn" id="sortBtn" aria-haspopup="true" aria-expanded="false">
            <span><?= e($sortNames[$sort]) ?></span>
            <svg class="chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <ul class="menu menu-right" id="sortMenu" hidden>
            <?php foreach ($sortNames as $key => $label): ?>
              <li><a class="<?= $sort === $key ? 'on' : '' ?>" href="<?= e(url(['sort' => $key])) ?>"><?= e($label) ?></a></li>
            <?php endforeach; ?>
          </ul>
        </div>
      </div>
    </div>

    <?php if ($tasks): ?>
      <ul class="task-list">
        <?php foreach ($tasks as $task): // dynamic rendering with a PHP loop ?>
          <?php $color = $categories[$task['cat']] ?? '#6c7086'; ?>
          <li>
            <a class="task<?= $task['done'] ? ' done' : '' ?><?= ($showDetail && $selectedId === $task['id']) ? ' selected' : '' ?>"
               href="<?= e(url(['task' => $task['id'], 'new' => null])) ?>">
              <span class="check-static"><img src="../assets/icons/<?= $task['done'] ? 'check-on' : 'check-off' ?>.png" alt="<?= $task['done'] ? 'Completed' : 'Not completed' ?>"></span>
              <div class="task-body">
                <div class="task-top">
                  <div class="task-title"><?= e($task['title']) ?></div>
                  <div class="task-meta">
                    <span class="chip<?= $task['cat'] === DEFAULT_CATEGORY ? ' plain' : '' ?>" style="--c:<?= e($color) ?>"><?= e($task['cat']) ?></span>
                    <span class="date"><img src="../assets/icons/calendar.png" alt=""><?= e(formatDate($task['due'])) ?></span>
                  </div>
                </div>
                <div class="task-desc"><?= e($task['desc']) ?></div>
              </div>
            </a>
          </li>
        <?php endforeach; ?>
      </ul>
    <?php elseif (!$allTasks): ?>
      <div class="empty">
        <img src="../assets/icons/no-task.png" alt="" class="empty-ic">
        <h3>No tasks yet</h3>
        <p>Use the form to create your first task.</p>
      </div>
    <?php else: ?>
      <div class="empty">
        <img src="../assets/icons/no-task.png" alt="" class="empty-ic">
        <h3>No tasks match your filters</h3>
        <p>Try another status or clear your search to see more tasks.</p>
        <?php if ($hasFilters): ?>
          <a class="btn btn-ghost" href="index.php"><img src="../assets/icons/clear-filters.png" alt="">Clear filters</a>
        <?php endif; ?>
      </div>
    <?php endif; ?>
  </main>

  <!-- ================= Right panel ================= -->
  <aside class="panel" id="panel">
    <?php if ($showDetail): // ---------- READ: task details ---------- ?>
      <?php $color = $categories[$selected['cat']] ?? '#6c7086'; ?>
      <div class="detail-head">
        <div>
          <div class="p-eyebrow">Task details</div>
          <h2><?= e($selected['title']) ?></h2>
        </div>
        <span class="status-ring<?= $selected['done'] ? ' on' : '' ?>" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>
        </span>
      </div>
      <div class="detail-meta">
        <span class="chip" style="--c:<?= e($color) ?>"><?= e($selected['cat']) ?></span>
        <span class="date"><img src="../assets/icons/calendar.png" alt=""><?= e(formatDate($selected['due'])) ?></span>
      </div>
      <div class="sec-title">Description</div>
      <p class="detail-desc"><?= e($selected['desc']) ?></p>
      <div class="sec-title">Status</div>
      <div class="status-box"><?= $selected['done'] ? 'Completed' : 'Not completed' ?></div>

    <?php else: // ---------- CREATE: self-submitting form ---------- ?>
      <div class="panel-ic"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div>
      <h2>Create task</h2>
      <p class="panel-sub">Capture what needs your attention next.</p>

      <form class="form" id="taskForm" method="POST" novalidate>
        <?php if ($errors): ?>
          <div class="banner" role="alert">
            <img src="../assets/icons/warning.png" alt="">
            <div><strong>Check the highlighted fields</strong><span>Fix the errors below before saving this task.</span></div>
          </div>
        <?php endif; ?>

        <div class="field<?= $bad('title') ?>">
          <label for="task_name"><span>Task name <i class="req">*</i></span></label>
          <input class="input" type="text" id="task_name" name="task_name" maxlength="80"
                 placeholder="What needs to be done?" value="<?= e($old['title']) ?>" autocomplete="off">
          <?php if (isset($errors['title'])): ?><p class="err"><img src="../assets/icons/warning.png" alt=""><?= e($errors['title']) ?></p><?php endif; ?>
        </div>

        <div class="field<?= $bad('desc') ?>">
          <label for="task_description"><span>Description <i class="req">*</i></span><span class="counter" id="counter"><?= mb_strlen($old['desc']) ?>/255</span></label>
          <textarea class="textarea" id="task_description" name="task_description" maxlength="255"
                    placeholder="Add a little context..."><?= e($old['desc']) ?></textarea>
          <?php if (isset($errors['desc'])): ?><p class="err"><img src="../assets/icons/warning.png" alt=""><?= e($errors['desc']) ?></p><?php endif; ?>
        </div>

        <div class="row2">
          <div class="field<?= $bad('due') ?>">
            <label for="due_date"><span>Due date <i class="opt">(optional)</i></span></label>
            <div class="date-input">
              <input type="date" id="due_date" name="due_date" value="<?= e($old['due']) ?>">
              <img src="../assets/icons/calendar.png" alt="">
            </div>
            <?php if (isset($errors['due'])): ?><p class="err"><img src="../assets/icons/warning.png" alt=""><?= e($errors['due']) ?></p><?php endif; ?>
          </div>
          <div class="field<?= $bad('cat') ?>">
            <label for="category"><span>Category <i class="req">*</i></span></label>
            <div class="select-wrap" style="margin-top:0">
              <select class="select" id="category" name="category" style="font-size:15px">
                <?php foreach ($categories as $name => $color): ?>
                  <option value="<?= e($name) ?>"<?= $old['cat'] === $name ? ' selected' : '' ?>><?= e($name) ?></option>
                <?php endforeach; ?>
              </select>
              <svg class="chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
            </div>
            <?php if (isset($errors['cat'])): ?><p class="err"><img src="../assets/icons/warning.png" alt=""><?= e($errors['cat']) ?></p><?php endif; ?>
          </div>
        </div>

        <div class="form-actions">
          <a class="btn btn-cancel" href="<?= e(url(['task' => null, 'new' => null])) ?>">Cancel</a>
          <button type="submit" name="submit" class="btn btn-primary">
            <svg viewBox="0 0 24 24" class="i"><path d="M12 5v14M5 12h14"/></svg>Add task
          </button>
        </div>
      </form>
    <?php endif; ?>
  </aside>
</div>

</body>
</html>
