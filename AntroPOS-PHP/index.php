<?php
require_once __DIR__ . '/helpers.php';
if (current_user()) {
    redirect('/admin/dashboard.php');
}
redirect('/login.php');
