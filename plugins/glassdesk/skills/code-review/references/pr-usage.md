# PR Review — Usage & Workflow Integration

## Usage Examples

**Full review (default):**
```
/review:pr
```

**Specific aspects:**
```
/review:pr tests errors
/review:pr comments
/review:pr simplify
```

**Parallel review:**
```
/review:pr all parallel
```

## Tips

- **Run early**: Before creating PR, not after
- **Focus on changes**: Agents analyze git diff by default
- **Address critical first**: Fix high-priority issues before lower priority
- **Re-run after fixes**: Verify issues are resolved
- **Use specific reviews**: Target specific aspects when you know the concern

## Workflow Integration

**Before committing:**
1. Write code
2. Run: `/review:pr code errors`
3. Fix any critical issues
4. Commit

**Before creating PR:**
1. Stage all changes
2. Run: `/review:pr all`
3. Address all critical and important issues
4. Run specific reviews again to verify
5. Create PR

**After PR feedback:**
1. Make requested changes
2. Run targeted reviews based on feedback
3. Verify issues are resolved
4. Push updates
