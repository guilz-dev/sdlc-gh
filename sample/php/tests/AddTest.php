<?php

declare(strict_types=1);

namespace Tests;

use App\Add;
use PHPUnit\Framework\TestCase;

final class AddTest extends TestCase
{
    public function testAdd(): void
    {
        $this->assertSame(5, Add::add(2, 3));
    }
}
