# frozen_string_literal: true

require_relative '../lib/add'

RSpec.describe Add do
  describe '.add' do
    it 'sums two integers' do
      expect(Add.add(2, 3)).to eq(5)
    end
  end
end
