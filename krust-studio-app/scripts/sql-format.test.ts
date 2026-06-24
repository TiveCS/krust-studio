import assert from 'node:assert/strict'
import test from 'node:test'
import { displaySql, formatSql } from '../src/renderer/src/lib/sqlFormat.ts'

test('formats MySQL with its native quoting', () => {
  const result = formatSql('select `user id`,name from `user` where id=1', 'mysql')
  assert.match(result, /^SELECT/m)
  assert.match(result, /`user id`/)
  assert.match(result, /FROM\s+`user`/)
})

test('formats PostgreSQL casts and quoted identifiers', () => {
  const result = formatSql('select "userId"::text from users where active=true', 'postgres')
  assert.match(result, /"userId"::text/)
  assert.match(result, /WHERE\s+active = TRUE/)
})

test('formats SQLite statements', () => {
  const result = formatSql('insert into notes(title,body) values("a","b")', 'sqlite')
  assert.match(result, /^INSERT INTO/m)
  assert.match(result, /VALUES/)
})

test('display formatting remains opt-in', () => {
  const exact = 'select * from users where id=1'
  assert.equal(displaySql(exact, 'postgres', false), exact)
  assert.notEqual(displaySql(exact, 'postgres', true), exact)
})

test('empty editor content stays untouched', () => {
  assert.equal(formatSql('   ', 'mysql'), '   ')
})
